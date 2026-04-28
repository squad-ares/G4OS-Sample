import { DisposableBase } from '@g4os/kernel/disposable';
import { BehaviorSubject, type Observable } from 'rxjs';
import {
  AUTH_ACCESS_TOKEN_KEY,
  AUTH_REFRESH_TOKEN_KEY,
  type AuthTokenStore,
  type SupabaseAuthPort,
} from '../types.ts';

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
    if (!meta?.expiresAt) {
      this.subject.next({ kind: 'idle' });
      return;
    }
    const expiresAt = meta.expiresAt;
    // CR8-29: meta.expiresAt corrompido (NaN, Infinity, negativo absurdo)
    // chegava em `Math.max(min, expiresAt - now - buffer)` → NaN/Infinity →
    // `setTimeout(fn, NaN)` dispara IMEDIATO em loop, ou pendura sem
    // executar. Validar finitude antes do cálculo.
    if (!Number.isFinite(expiresAt)) {
      this.subject.next({ kind: 'reauth_required', reason: 'invalid_expiry' });
      return;
    }
    const delay = Math.max(this.minDelayMs, expiresAt - this.nowFn() - this.bufferMs);
    if (!Number.isFinite(delay)) {
      this.subject.next({ kind: 'reauth_required', reason: 'invalid_expiry' });
      return;
    }
    const fireAt = this.nowFn() + delay;
    this.subject.next({ kind: 'scheduled', fireAt });
    this.pending = this.setTimerFn(() => {
      this.pending = null;
      void this.refresh();
    }, delay);
  }

  private async refresh(): Promise<void> {
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
    await this.tokenStore.set(
      AUTH_ACCESS_TOKEN_KEY,
      data.session.access_token,
      typeof data.session.expires_at === 'number'
        ? { expiresAt: data.session.expires_at * 1000 }
        : undefined,
    );
    if (data.session.refresh_token) {
      await this.tokenStore.set(AUTH_REFRESH_TOKEN_KEY, data.session.refresh_token);
    }
    await this.scheduleNext();
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
