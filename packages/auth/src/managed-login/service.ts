import { DisposableBase } from '@g4os/kernel/disposable';
import { AuthError } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { err, ok, type Result } from 'neverthrow';
import { BehaviorSubject, type Observable } from 'rxjs';
import { sendOtp, verifyOtp } from '../otp/otp-flow.ts';
import {
  AUTH_ACCESS_TOKEN_KEY,
  AUTH_REFRESH_TOKEN_KEY,
  AUTH_SESSION_META_KEY,
  type AuthSession,
  type AuthTokenStore,
  type SupabaseAuthPort,
} from '../types.ts';
import { IDLE_STATE, type ManagedLoginState } from './state.ts';

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

  get state$(): Observable<ManagedLoginState> {
    return this.subject.asObservable();
  }

  async requestOtp(email: string): Promise<Result<void, AuthError>> {
    const previous = this.subject.value;
    this.setState({ kind: 'requesting_otp', email });
    const result = await sendOtp(this.supabase, email);
    if (result.isErr()) {
      this.setState({ kind: 'error', error: result.error, previous });
      return err(result.error);
    }
    this.setState({ kind: 'awaiting_otp', email });
    return ok(undefined);
  }

  async submitOtp(email: string, token: string): Promise<Result<AuthSession, AuthError>> {
    const previous = this.subject.value;
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
    await this.tokenStore.delete(AUTH_ACCESS_TOKEN_KEY);
    await this.tokenStore.delete(AUTH_REFRESH_TOKEN_KEY);
    await this.tokenStore.delete(AUTH_SESSION_META_KEY);
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
    const accessResult = await this.tokenStore.get(AUTH_ACCESS_TOKEN_KEY);
    if (accessResult.isErr()) return false;
    if (accessResult.value === '') return false;
    const metaResult = await this.tokenStore.get(AUTH_SESSION_META_KEY);
    if (metaResult.isErr()) return false;
    const meta = parseMeta(metaResult.value);
    if (!meta) return false;

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

  private async persistSession(session: AuthSession): Promise<Result<void, AuthError>> {
    const setAccess = await this.tokenStore.set(
      AUTH_ACCESS_TOKEN_KEY,
      session.accessToken,
      session.expiresAt === undefined ? undefined : { expiresAt: session.expiresAt },
    );
    if (setAccess.isErr()) return err(setAccess.error);
    if (session.refreshToken) {
      const setRefresh = await this.tokenStore.set(AUTH_REFRESH_TOKEN_KEY, session.refreshToken);
      if (setRefresh.isErr()) return err(setRefresh.error);
    }
    const metaJson = JSON.stringify({
      userId: session.userId,
      email: session.email,
      ...(session.expiresAt === undefined ? {} : { expiresAt: session.expiresAt }),
    } satisfies PersistedSessionMeta);
    const setMeta = await this.tokenStore.set(AUTH_SESSION_META_KEY, metaJson);
    if (setMeta.isErr()) return err(setMeta.error);
    return ok(undefined);
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
    if (typeof userId !== 'string' || typeof email !== 'string') return null;
    return {
      userId,
      email,
      ...(typeof expiresAt === 'number' ? { expiresAt } : {}),
    };
  } catch {
    return null;
  }
}
