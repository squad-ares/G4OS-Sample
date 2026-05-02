import { DisposableBase } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import { BehaviorSubject, type Observable } from 'rxjs';
import {
  AUTH_ACCESS_TOKEN_KEY,
  AUTH_REFRESH_TOKEN_KEY,
  AUTH_SESSION_META_KEY,
  type AuthTokenStore,
  type SupabaseAuthPort,
} from '../types.ts';

const log = createLogger('auth:session-refresher');

export type RefresherState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'scheduled'; readonly fireAt: number }
  | { readonly kind: 'refreshing' }
  | { readonly kind: 'reauth_required'; readonly reason: string }
  | { readonly kind: 'disabled' };

export interface SessionRefresherOptions {
  readonly supabase: SupabaseAuthPort;
  readonly tokenStore: AuthTokenStore;
  readonly now?: () => number;
  readonly setTimer?: (fn: () => void, ms: number) => { cancel: () => void };
  readonly bufferMs?: number;
  readonly minDelayMs?: number;
}

const DEFAULT_BUFFER_MS = 5 * 60 * 1000;
const DEFAULT_MIN_DELAY_MS = 1000;
/**
 * Máximo de schedules consecutivos no piso `minDelayMs` antes de bailar para
 * `reauth_required`. CR-18 F-AU2: backend devolvendo tokens cronicamente
 * curtos faria o refresher martelar a 1Hz. 3 retries permite caminho
 * saudável (token expirado → refresh imediato → token novo de 1h) mas barra
 * o loop quando o backend está degradado.
 */
const MAX_TIGHT_SCHEDULES = 3;

export class SessionRefresher extends DisposableBase {
  private readonly subject = new BehaviorSubject<RefresherState>({ kind: 'idle' });
  private readonly supabase: SupabaseAuthPort;
  private readonly tokenStore: AuthTokenStore;
  private readonly nowFn: () => number;
  private readonly setTimerFn: (fn: () => void, ms: number) => { cancel: () => void };
  private readonly bufferMs: number;
  private readonly minDelayMs: number;
  private pending: { cancel: () => void } | null = null;
  private started = false;
  /**
   * Coalesce concorrentes. `refreshNow()` + tick agendado
   * podiam executar `refresh()` em paralelo, ambos escrevendo ao
   * tokenStore — o segundo ganhador sobrescrevia o primeiro com token
   * já invalidado pelo provider (refresh tokens são single-use em
   * Supabase/Google). Caller que chega quando já há refresh em vôo
   * compartilha a mesma promise.
   */
  private inflight: Promise<void> | null = null;
  /**
   * CR-18 F-AU2: contador de schedules consecutivas que caem no piso
   * `minDelayMs` (token já dentro do buffer ou past-expiry quando agendou).
   * Backend que devolve tokens com `expires_at` curto cronicamente faria
   * o refresher martelar a 1Hz. Após N=3 caps consecutivos emitimos
   * `reauth_required` em vez de continuar agendando.
   */
  private tightScheduleCount = 0;

  constructor(options: SessionRefresherOptions) {
    super();
    this.supabase = options.supabase;
    this.tokenStore = options.tokenStore;
    this.nowFn = options.now ?? (() => Date.now());
    this.setTimerFn =
      options.setTimer ??
      ((fn, ms) => {
        const h = setTimeout(fn, ms);
        return { cancel: () => clearTimeout(h) };
      });
    this.bufferMs = options.bufferMs ?? DEFAULT_BUFFER_MS;
    this.minDelayMs = options.minDelayMs ?? DEFAULT_MIN_DELAY_MS;
  }

  get state$(): Observable<RefresherState> {
    return this.subject.asObservable();
  }

  get state(): RefresherState {
    return this.subject.value;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.scheduleNext();
  }

  async refreshNow(): Promise<void> {
    this.cancelPending();
    if (this.inflight) {
      // Já há refresh em vôo (do tick agendado ou outro refreshNow).
      // Não dispara um segundo — espera o atual e retorna.
      await this.inflight;
      return;
    }
    await this.refresh();
  }

  private async scheduleNext(): Promise<void> {
    this.cancelPending();
    const list = await this.tokenStore.list();
    if (list.isErr()) {
      this.subject.next({ kind: 'reauth_required', reason: 'token_list_failed' });
      return;
    }
    const meta = list.value.find((m) => m.key === AUTH_ACCESS_TOKEN_KEY);
    if (!meta) {
      // Sem token persistido — idle correto (ainda não autenticou).
      this.subject.next({ kind: 'idle' });
      return;
    }
    if (!meta.expiresAt) {
      // Token persistido mas sem `expiresAt` é estado degradado —
      // não dá pra rotacionar, então fica idle, mas log warn explicit para
      // operador detectar via debug-export. Causa típica: provider que não
      // retorna `expires_at` (Supabase legacy, custom OAuth) ou meta
      // corrompida em disco.
      log.warn(
        { key: AUTH_ACCESS_TOKEN_KEY },
        'access token present but missing expiresAt — refresh disabled until next login',
      );
      this.subject.next({ kind: 'idle' });
      return;
    }
    const expiresAt = meta.expiresAt;
    // meta.expiresAt corrompido (NaN, Infinity, negativo absurdo)
    // chegava em `Math.max(min, expiresAt - now - buffer)` → NaN/Infinity →
    // `setTimeout(fn, NaN)` dispara IMEDIATO em loop, ou pendura sem
    // executar. Validar finitude antes do cálculo.
    if (!Number.isFinite(expiresAt)) {
      this.subject.next({ kind: 'reauth_required', reason: 'invalid_expiry' });
      return;
    }
    const rawDelay = expiresAt - this.nowFn() - this.bufferMs;
    const delay = Math.max(this.minDelayMs, rawDelay);
    if (!Number.isFinite(delay)) {
      this.subject.next({ kind: 'reauth_required', reason: 'invalid_expiry' });
      return;
    }
    // CR-18 F-AU2: token chegou no piso minDelayMs porque já está dentro do
    // buffer (rawDelay ≤ minDelayMs). Primeira vez é OK — refresh imediato
    // é o caminho saudável quando token está expirado. Mas se isso se
    // repete N vezes consecutivas após refresh bem-sucedido, o backend
    // está devolvendo tokens curtos cronicamente — bail para `reauth_required`.
    if (rawDelay <= this.minDelayMs) {
      this.tightScheduleCount += 1;
      if (this.tightScheduleCount >= MAX_TIGHT_SCHEDULES) {
        log.warn(
          {
            expiresAt,
            now: this.nowFn(),
            bufferMs: this.bufferMs,
            consecutiveTight: this.tightScheduleCount,
          },
          'refresher detected sustained near-expiry tokens; requiring reauth instead of tight-loop',
        );
        this.tightScheduleCount = 0;
        this.subject.next({ kind: 'reauth_required', reason: 'token_too_short_lived' });
        return;
      }
    } else {
      this.tightScheduleCount = 0;
    }
    const fireAt = this.nowFn() + delay;
    this.subject.next({ kind: 'scheduled', fireAt });
    this.pending = this.setTimerFn(() => {
      this.pending = null;
      void this.refresh();
    }, delay);
  }

  private async refresh(): Promise<void> {
    // Coalesce — se já há refresh em vôo, compartilha a promise.
    // Caller via timer ou refreshNow chega aqui após cancelPending, então
    // o único caminho concorrente é tick disparando enquanto outro
    // tick/refreshNow ainda nao concluiu (race em janela curtíssima entre
    // setTimerFn callback e await scheduleNext).
    if (this.inflight) {
      await this.inflight;
      return;
    }
    const promise = this.runRefresh();
    this.inflight = promise;
    try {
      await promise;
    } finally {
      this.inflight = null;
    }
  }

  private async runRefresh(): Promise<void> {
    this.subject.next({ kind: 'refreshing' });
    const refreshToken = await this.tokenStore.get(AUTH_REFRESH_TOKEN_KEY);
    if (refreshToken.isErr() || !refreshToken.value) {
      this.subject.next({ kind: 'reauth_required', reason: 'no_refresh_token' });
      return;
    }
    const { data, error } = await this.supabase.refreshSession({
      refreshToken: refreshToken.value,
    });
    if (error || !data.session) {
      this.subject.next({
        kind: 'reauth_required',
        reason: error?.message ?? 'refresh_failed',
      });
      return;
    }
    // CR-18 F-AU1: descartar o `Result` dos tokenStore.set silencia disk
    // full / IO error e leva o refresher a `scheduleNext` referenciando
    // estado inconsistente (ou loopa tentando salvar em vão). Sinalizamos
    // `reauth_required` reason=`token_persist_failed` quando qualquer write
    // falha — usuário precisa relogar pra recriar o slot do zero.
    const accessSet = await this.tokenStore.set(
      AUTH_ACCESS_TOKEN_KEY,
      data.session.access_token,
      typeof data.session.expires_at === 'number'
        ? { expiresAt: data.session.expires_at * 1000 }
        : undefined,
    );
    if (accessSet.isErr()) {
      log.warn(
        { err: accessSet.error.message },
        'failed to persist refreshed access token; requiring reauth',
      );
      this.subject.next({ kind: 'reauth_required', reason: 'token_persist_failed' });
      return;
    }
    if (data.session.refresh_token) {
      const refreshSet = await this.tokenStore.set(
        AUTH_REFRESH_TOKEN_KEY,
        data.session.refresh_token,
      );
      if (refreshSet.isErr()) {
        log.warn(
          { err: refreshSet.error.message },
          'failed to persist refreshed refresh token; requiring reauth',
        );
        this.subject.next({ kind: 'reauth_required', reason: 'token_persist_failed' });
        return;
      }
    }
    // CR-22 F-CR22-1: também atualiza o `AUTH_SESSION_META_KEY` JSON com o novo
    // expiresAt. Sem isso, a meta persistida fica congelada no expiry do
    // login original; `ManagedLoginService.restore()` lê esse campo no boot e
    // força re-login mesmo com access token válido em disco. Read-modify-write
    // preserva `userId`/`email` da meta original.
    if (typeof data.session.expires_at === 'number') {
      await this.persistMetaExpiry(data.session.expires_at * 1000);
    }
    await this.scheduleNext();
  }

  private async persistMetaExpiry(newExpiresAt: number): Promise<void> {
    const metaResult = await this.tokenStore.get(AUTH_SESSION_META_KEY);
    if (metaResult.isErr() || metaResult.value === '') return;
    let parsed: Record<string, unknown>;
    try {
      const raw = JSON.parse(metaResult.value) as unknown;
      if (raw === null || typeof raw !== 'object') return;
      parsed = raw as Record<string, unknown>;
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'session meta JSON corrupted during refresh; skipping expiry update',
      );
      return;
    }
    parsed['expiresAt'] = newExpiresAt;
    const metaSet = await this.tokenStore.set(AUTH_SESSION_META_KEY, JSON.stringify(parsed));
    if (metaSet.isErr()) {
      log.warn(
        { err: metaSet.error.message },
        'failed to persist refreshed session meta expiresAt; restore() may force reauth on next start',
      );
    }
  }

  private cancelPending(): void {
    this.pending?.cancel();
    this.pending = null;
  }

  override dispose(): void {
    if (this.subject.closed) {
      // Idempotente: dispose() chamado 2x não emite num subject completado
      // (rxjs ignora silenciosamente, mas log noise some).
      super.dispose();
      return;
    }
    this.cancelPending();
    this.subject.next({ kind: 'disabled' });
    this.subject.complete();
    super.dispose();
  }
}
