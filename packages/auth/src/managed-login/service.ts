import { DisposableBase } from '@g4os/kernel/disposable';
import { AuthError } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { err, ok, type Result } from 'neverthrow';
import { BehaviorSubject, map, type Observable } from 'rxjs';
import { sendOtp, verifyOtp } from '../otp/otp-flow.ts';
import {
  AUTH_ACCESS_TOKEN_KEY,
  AUTH_REFRESH_TOKEN_KEY,
  AUTH_SESSION_META_KEY,
  type AuthSession,
  type AuthTokenStore,
  type SupabaseAuthPort,
} from '../types.ts';
import {
  IDLE_STATE,
  type ManagedLoginState,
  type RedactedManagedLoginState,
  redactManagedLoginState,
} from './state.ts';

const log = createLogger('managed-login');

/**
 * Buffer mínimo (ms) antes do expiry persistido em que `restore()` ainda
 * marca a sessão como `authenticated`. Se o token está dentro deste
 * buffer, melhor não restaurar — caller deve abrir login flow ou deixar
 * o `SessionRefresher` cuidar de obter novo token primeiro.
 */
const RESTORE_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

interface PersistedSessionMeta {
  readonly userId: string;
  readonly email: string;
  readonly expiresAt?: number;
}

export interface ManagedProviderBootstrap {
  run(session: AuthSession): Promise<void>;
}

export interface ManagedLoginServiceOptions {
  readonly supabase: SupabaseAuthPort;
  readonly tokenStore: AuthTokenStore;
  readonly bootstrap?: ManagedProviderBootstrap;
}

export class ManagedLoginService extends DisposableBase {
  private readonly subject = new BehaviorSubject<ManagedLoginState>(IDLE_STATE);
  private readonly supabase: SupabaseAuthPort;
  private readonly tokenStore: AuthTokenStore;
  private readonly bootstrap?: ManagedProviderBootstrap;

  constructor(options: ManagedLoginServiceOptions) {
    super();
    this.supabase = options.supabase;
    this.tokenStore = options.tokenStore;
    if (options.bootstrap) this.bootstrap = options.bootstrap;
  }

  get state(): ManagedLoginState {
    return this.subject.value;
  }

  /**
   * @deprecated Para telemetria/logs/Sentry use `redactedState$` —
   * este Observable carrega o email do usuário (PII) e tokens preview no
   * payload bruto. Suba pra UI/state-sync apenas onde a UI realmente
   * precisa do email (ex: tela de login). Em qualquer outro contexto
   * (breadcrumbs, métricas, exports), prefira a versão redacted.
   */
  get state$(): Observable<ManagedLoginState> {
    return this.subject.asObservable();
  }

  /**
   * Canal de telemetria PII-safe. Mesma semântica de FSM transitions
   * de `state$`, mas sem email/tokens. Use este em Sentry breadcrumbs,
   * métricas, debug exports e logs estruturados.
   */
  get redactedState$(): Observable<RedactedManagedLoginState> {
    return this.subject.asObservable().pipe(map(redactManagedLoginState));
  }

  async requestOtp(email: string): Promise<Result<void, AuthError>> {
    // Bloqueia chamadas pós-dispose. Sem isso, listeners em
    // `subject` continuam emitindo após `subject.complete()` (silencioso
    // no rxjs, mas I/O e setState rodam à toa) e UI consumidora ainda
    // recebia transitions de FSM em janelas race entre logout/quit.
    if (this._disposed) {
      return err(AuthError.disposed());
    }
    // Entry guard. requestOtp só faz sentido a partir de
    // estados terminais (idle/awaiting_otp/error/authenticated) — chamar
    // no meio de `verifying` ou `bootstrapping` indica bug do caller
    // (UI deveria desabilitar botão durante esses estados). Rejeitar
    // explicitamente evita transitions inválidas que mascarem o bug.
    const current = this.subject.value;
    // F-CR32-5: incluir `bootstrapping` no guard. Bootstrap em vôo é estado
    // inválido para iniciar novo OTP — FSM corrompida se bootstrap.run()
    // concluir e sobrescrever o estado `requesting_otp`/`awaiting_otp` novo.
    if (
      current.kind === 'verifying' ||
      current.kind === 'requesting_otp' ||
      current.kind === 'bootstrapping'
    ) {
      log.warn({ from: current.kind }, 'requestOtp ignored: another OTP flow in progress');
      // CR-18 F-AU3: era `AuthError.disposed()` — caller checando
      // `code === AUTH_DISPOSED` disparava shutdown indevido. `flowInProgress`
      // discrimina: "tente de novo" vs "serviço destruído".
      return err(AuthError.flowInProgress(current.kind));
    }
    // Sanitiza `previous` para nunca aninhar error → error → error.
    // Se o estado atual já é error, o "anterior" lógico é o `previous` dele
    // (a chance de estado válido pra back-button). Evita nesting infinito.
    const previous = sanitizePrevious(this.subject.value);
    this.setState({ kind: 'requesting_otp', email });
    const result = await sendOtp(this.supabase, email);
    if (this._disposed) return err(AuthError.disposed());
    if (result.isErr()) {
      this.setState({ kind: 'error', error: result.error, previous });
      return err(result.error);
    }
    this.setState({ kind: 'awaiting_otp', email });
    return ok(undefined);
  }

  async submitOtp(email: string, token: string): Promise<Result<AuthSession, AuthError>> {
    // Idem requestOtp.
    if (this._disposed) {
      return err(AuthError.disposed());
    }
    // Entry guard relaxado. Bloqueia apenas estados que
    // indicam "já há flow em andamento" — duplo-clique, retry antes do
    // primeiro completar, ou bootstrapping em curso. Permite chamada de
    // idle (deep-link com OTP code) e de error (retry após bad code).
    const currentSubmit = this.subject.value;
    if (
      currentSubmit.kind === 'verifying' ||
      currentSubmit.kind === 'bootstrapping' ||
      currentSubmit.kind === 'requesting_otp'
    ) {
      log.warn({ from: currentSubmit.kind }, 'submitOtp ignored: another auth flow in progress');
      // CR-18 F-AU3: ver requestOtp acima.
      return err(AuthError.flowInProgress(currentSubmit.kind));
    }
    const previous = sanitizePrevious(this.subject.value);
    this.setState({ kind: 'verifying', email });
    const result = await verifyOtp(this.supabase, email, token);
    if (result.isErr()) {
      this.setState({ kind: 'error', error: result.error, previous });
      return err(result.error);
    }
    const session = result.value;

    const persisted = await this.persistSession(session);
    if (persisted.isErr()) {
      this.setState({ kind: 'error', error: persisted.error, previous });
      return err(persisted.error);
    }

    this.setState({ kind: 'bootstrapping', session });
    if (this.bootstrap) {
      try {
        await this.bootstrap.run(session);
      } catch (cause) {
        // Sem o try/catch a FSM ficava presa em `bootstrapping` quando
        // o managed-provider quebrava (apesar do Supabase ter sucedido)
        // — usuário em limbo. ADR-0092 promete FSM completa.
        const error =
          cause instanceof Error
            ? AuthError.bootstrapFailed(cause.message)
            : AuthError.bootstrapFailed(String(cause));
        this.setState({ kind: 'error', error, previous });
        return err(error);
      }
    }
    this.setState({ kind: 'authenticated', session });
    return ok(session);
  }

  async logout(): Promise<void> {
    // F-CR32-9: early-return pós-dispose (ADR-0012). Tokens já devem ter sido
    // deletados no fluxo normal de shutdown; operar num vault prestes a
    // fechar é desnecessário e pode mascarar erros de teardown.
    if (this._disposed) return;
    // Paralelizar deletes via Promise.allSettled. Sequencial era
    // problemático: se primeiro falhasse, segundo nunca rodava → tokens
    // órfãos. Agora todos rodam, partial failure só é logada — state
    // SEMPRE volta pra idle pra UI fechar limpo.
    const results = await Promise.allSettled([
      this.tokenStore.delete(AUTH_ACCESS_TOKEN_KEY),
      this.tokenStore.delete(AUTH_REFRESH_TOKEN_KEY),
      this.tokenStore.delete(AUTH_SESSION_META_KEY),
    ]);
    for (const r of results) {
      if (r.status === 'rejected') {
        log.warn({ reason: r.reason }, 'logout delete failed; partial state may persist');
      }
    }
    this.setState(IDLE_STATE);
  }

  /**
   * Restaura a sessão persistida em disco (vault) na inicialização.
   *
   * Antes: marcava `authenticated` mesmo com token vencido. Combinado
   * com `refresher.start()` em paralelo, criava janela de race em que o
   * app aceitava chamadas authed por alguns segundos com token expirado
   * antes do primeiro tick do refresher emitir `reauth_required`.
   *
   * Agora: se `meta.expiresAt < now() + bufferMs`, devolve `false` e
   * deixa o refresher (ou o caller) decidir como proceder. Retorna
   * `false` também quando não há sessão persistida — comportamento
   * idêntico para o caller.
   */
  async restore(): Promise<boolean> {
    // F-CR32-9: early-return pós-dispose (ADR-0012). Race em quit imediato
    // após init — `setState` em subject completed seria no-op mas a I/O
    // aconteceria à toa, podendo gravar lixo num vault em teardown.
    if (this._disposed) return false;
    const accessResult = await this.tokenStore.get(AUTH_ACCESS_TOKEN_KEY);
    if (accessResult.isErr()) return false;
    if (accessResult.value === '') return false;
    const metaResult = await this.tokenStore.get(AUTH_SESSION_META_KEY);
    if (metaResult.isErr()) return false;
    const meta = parseMeta(metaResult.value);
    if (!meta) {
      // CR-18 F-AU5: meta corrompida (JSON malformado, schema antigo
      // incompatível, dados truncados) ficava persistida indefinidamente —
      // todo restore subsequente falhava igual sem self-healing. User
      // precisava wipe manual. Best-effort delete do meta key para que o
      // próximo login reconstrua o slot do zero.
      log.warn('persisted session meta is corrupt; clearing for self-healing');
      const deleteResult = await this.tokenStore.delete(AUTH_SESSION_META_KEY);
      if (deleteResult.isErr()) {
        log.warn(
          { err: deleteResult.error.message },
          'failed to delete corrupt session meta; user may need wipe',
        );
      }
      return false;
    }

    if (meta.expiresAt !== undefined && meta.expiresAt <= Date.now() + RESTORE_EXPIRY_BUFFER_MS) {
      log.info(
        { expiresAt: meta.expiresAt },
        'persisted session expired or near expiry; not restoring',
      );
      return false;
    }

    const refreshResult = await this.tokenStore.get(AUTH_REFRESH_TOKEN_KEY);
    const refreshToken =
      refreshResult.isOk() && refreshResult.value !== '' ? refreshResult.value : undefined;

    const session: AuthSession = {
      userId: meta.userId,
      email: meta.email,
      accessToken: accessResult.value,
      ...(refreshToken === undefined ? {} : { refreshToken }),
      ...(meta.expiresAt === undefined ? {} : { expiresAt: meta.expiresAt }),
    };

    this.setState({ kind: 'authenticated', session });
    return true;
  }

  // Rollback explícito quando uma das 3 escritas falha. Sem isso,
  // sucesso parcial deixa tokens órfãos (ex: setMeta falha mas setAccess
  // já gravou) e `restore()` retorna false — usuário fica unauthenticated
  // mas com lixo persistente até `wipeAndReset`.
  // Rollback erros agora são logados (antes silenciados via
  // `.catch(() => undefined)`). Sem visibilidade, partial-rollback failures
  // (ex: disk-full impede também o delete) ficavam invisíveis.
  private async persistSession(session: AuthSession): Promise<Result<void, AuthError>> {
    const setAccess = await this.tokenStore.set(
      AUTH_ACCESS_TOKEN_KEY,
      session.accessToken,
      session.expiresAt === undefined ? undefined : { expiresAt: session.expiresAt },
    );
    if (setAccess.isErr()) return err(setAccess.error);

    if (session.refreshToken) {
      const setRefresh = await this.tokenStore.set(AUTH_REFRESH_TOKEN_KEY, session.refreshToken);
      if (setRefresh.isErr()) {
        // Rollback access token — refresh-token write falhou
        await this.rollbackDelete(AUTH_ACCESS_TOKEN_KEY, 'refresh-write-failed');
        return err(setRefresh.error);
      }
    }

    const metaJson = JSON.stringify({
      userId: session.userId,
      email: session.email,
      ...(session.expiresAt === undefined ? {} : { expiresAt: session.expiresAt }),
    } satisfies PersistedSessionMeta);
    const setMeta = await this.tokenStore.set(AUTH_SESSION_META_KEY, metaJson);
    if (setMeta.isErr()) {
      // Rollback access + refresh — meta falhou
      await this.rollbackDelete(AUTH_ACCESS_TOKEN_KEY, 'meta-write-failed');
      if (session.refreshToken) {
        await this.rollbackDelete(AUTH_REFRESH_TOKEN_KEY, 'meta-write-failed');
      }
      return err(setMeta.error);
    }
    return ok(undefined);
  }

  private async rollbackDelete(key: string, phase: string): Promise<void> {
    try {
      const result = await this.tokenStore.delete(key);
      if (result.isErr()) {
        log.warn(
          { key, phase, err: result.error.message },
          'persistSession rollback delete failed; partial state may persist',
        );
      }
    } catch (cause) {
      log.warn(
        { key, phase, err: cause instanceof Error ? cause.message : String(cause) },
        'persistSession rollback delete threw; partial state may persist',
      );
    }
  }

  private setState(next: ManagedLoginState): void {
    this.subject.next(next);
  }

  override dispose(): void {
    if (this._disposed) return;
    this.subject.complete();
    super.dispose();
  }
}

function parseMeta(raw: string): PersistedSessionMeta | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object') return null;
    const record = parsed as Record<string, unknown>;
    const userId = record['userId'];
    const email = record['email'];
    const expiresAt = record['expiresAt'];
    // F-CR32-11: strings vazias passam em `typeof x === 'string'` mas são
    // inválidas — restore() construiria AuthSession com userId/email vazios,
    // transitando para `authenticated` sem identidade real.
    if (typeof userId !== 'string' || userId.length === 0) return null;
    if (typeof email !== 'string' || email.length === 0) return null;
    return {
      userId,
      email,
      ...(typeof expiresAt === 'number' ? { expiresAt } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Extrai um `previous` seguro pra `error` state. Sem isso, retry
 * de OTP a partir de error nesting acumula:
 *  - 1ª falha: state = `{error, previous: awaiting_otp}` ✓
 *  - 2ª falha (retry de error): state = `{error, previous: {error, previous: awaiting_otp}}` ✗
 * Solução: se o "atual" é error, usar `previous.previous` (o estado válido antes do
 * primeiro error). Em último caso, IDLE.
 */
function sanitizePrevious(current: ManagedLoginState): ManagedLoginState {
  if (current.kind !== 'error') return current;
  const inner = current.previous;
  if (inner.kind === 'error') return IDLE_STATE;
  return inner;
}
