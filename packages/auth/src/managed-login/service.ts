import { DisposableBase } from '@g4os/kernel/disposable';
import type { AuthError } from '@g4os/kernel/errors';
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
      await this.bootstrap.run(session);
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
   * Sem refresh proativo — apenas rehidrata o estado se access token e
   * metadata estiverem presentes. `SessionRefresher` cuida de renovar
   * quando expirar. Retorna `false` quando não há sessão persistida.
   */
  async restore(): Promise<boolean> {
    const accessResult = await this.tokenStore.get(AUTH_ACCESS_TOKEN_KEY);
    if (accessResult.isErr()) return false;
    const metaResult = await this.tokenStore.get(AUTH_SESSION_META_KEY);
    if (metaResult.isErr()) return false;
    const meta = parseMeta(metaResult.value);
    if (!meta) return false;

    const refreshResult = await this.tokenStore.get(AUTH_REFRESH_TOKEN_KEY);
    const refreshToken = refreshResult.isOk() ? refreshResult.value : undefined;

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
