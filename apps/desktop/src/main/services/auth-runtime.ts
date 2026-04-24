/**
 * Wiring de autenticação para o processo main.
 *
 * Substitui a antiga `auth-service.ts` (que duplicava a lógica do pacote
 * `@g4os/auth`) por uma composição dos serviços oficiais:
 *
 *   - `@g4os/auth/supabase` → loader + validação de env + adapter do SDK
 *   - `@g4os/auth/managed-login` → `ManagedLoginService` (FSM + persistência)
 *   - `@g4os/auth/refresh` → `SessionRefresher` (refresh background)
 *
 * O `AuthService` exposto ao IPC é uma view fina sobre o `ManagedLoginService`.
 * Nenhum módulo desta aplicação toca no SDK do Supabase diretamente: o
 * adapter é o único consumidor, via import dinâmico.
 */

import {
  AUTH_ACCESS_TOKEN_KEY,
  AUTH_SESSION_META_KEY,
  type AuthTokenStore,
  createSupabaseAdapter,
  defaultSupabaseClientFactory,
  loadSupabaseEnvFiles,
  ManagedLoginService,
  SessionRefresher,
  type SupabaseAuthPort,
  type SupabaseEnvValidationResult,
  validateSupabaseEnv,
} from '@g4os/auth';
import type { CredentialVault } from '@g4os/credentials';
import type { AuthService, IpcSession } from '@g4os/ipc/server';
import { AppError, AuthError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { err, ok, type Result } from 'neverthrow';
import { createInMemoryTokenStore, createVaultBackedTokenStore } from './auth-token-store.ts';

const log = createLogger('auth-runtime');

export interface AuthRuntimeOptions {
  readonly rootDir: string;
  /**
   * Quando `true`, pula a tentativa de carregar `.env`/`.env.local` do
   * disco e lê apenas do `envSource`. Usado em builds empacotados.
   */
  readonly skipDotEnv?: boolean;
  /** Override do source de env (ex: `process.env`). */
  readonly envSource?: Readonly<Record<string, string | undefined>>;
  /**
   * Cofre de credenciais compartilhado. Quando fornecido, os tokens de
   * sessão são persistidos via `safeStorage` e sobrevivem a restart do
   * app. Sem ele, o runtime cai no fallback in-memory (útil em testes).
   */
  readonly credentialVault?: CredentialVault;
  /**
   * Quando `true`, ignora validação Supabase e pré-autentica com sessão fake.
   * Usado somente em E2E (`G4OS_E2E=1`). Em produção, `createAuthRuntime`
   * precisa das envs reais para configurar o OTP flow.
   */
  readonly mockAuthMode?: boolean;
}

export interface AuthRuntime {
  readonly service: AuthService;
  readonly configured: boolean;
  readonly missingEnv: readonly string[];
  readonly filesLoaded: readonly string[];
  readonly managedLogin?: ManagedLoginService;
  readonly refresher?: SessionRefresher;
  dispose(): void;
}

export function createAuthRuntime(options: AuthRuntimeOptions): AuthRuntime {
  const filesLoaded: string[] = [];

  if (options.mockAuthMode === true) {
    return buildMockAuthRuntime();
  }

  const combined: Record<string, string | undefined> = { ...(options.envSource ?? {}) };

  if (options.skipDotEnv !== true) {
    const loaded = loadSupabaseEnvFiles(options.rootDir);
    filesLoaded.push(...loaded.filesLoaded);
    for (const [k, v] of Object.entries(loaded.env)) {
      if (combined[k] === undefined) combined[k] = v;
    }
  }

  const validation: SupabaseEnvValidationResult = validateSupabaseEnv(combined);

  if (!validation.ok || !validation.env) {
    log.warn(
      { missing: validation.missing, filesLoaded },
      'supabase env ausente; login OTP fica bloqueado até .env ser configurado',
    );
    return {
      service: createUnavailableAuthService(validation.missing),
      configured: false,
      missingEnv: validation.missing,
      filesLoaded,
      dispose: () => {
        /* nothing to dispose */
      },
    };
  }

  const supabase = createSupabaseAdapter({
    env: validation.env,
    clientFactory: defaultSupabaseClientFactory,
  });

  const tokenStore = options.credentialVault
    ? createVaultBackedTokenStore(options.credentialVault)
    : createInMemoryTokenStore();
  const managedLogin = new ManagedLoginService({ supabase, tokenStore });
  const refresher = new SessionRefresher({ supabase, tokenStore });

  const service = createAuthServiceFromManagedLogin(managedLogin, async () => {
    await refresher.refreshNow();
  });

  // Start refresher automaticamente quando uma sessão for persistida.
  const subscription = managedLogin.state$.subscribe((state) => {
    if (state.kind === 'authenticated') {
      void refresher.start();
    }
  });

  // Rehidratar sessão persistida em vault na inicialização.
  void managedLogin.restore().then((restored) => {
    if (restored) log.info({}, 'auth session restored from vault');
  });

  return {
    service,
    configured: true,
    missingEnv: [],
    filesLoaded,
    managedLogin,
    refresher,
    dispose: () => {
      subscription.unsubscribe();
      refresher.dispose();
      managedLogin.dispose();
    },
  };
}

function createAuthServiceFromManagedLogin(
  managed: ManagedLoginService,
  onPostVerify: () => Promise<void>,
): AuthService {
  const toIpcSession = (): IpcSession | null => {
    const state = managed.state;
    if (state.kind === 'authenticated' || state.kind === 'bootstrapping') {
      const s = state.session;
      return {
        userId: s.userId,
        email: s.email,
        ...(s.expiresAt === undefined ? {} : { expiresAt: s.expiresAt }),
      };
    }
    return null;
  };

  return {
    getMe: (): Promise<Result<IpcSession, AppError>> => {
      const session = toIpcSession();
      if (!session) return Promise.resolve(err(AuthError.notAuthenticated()));
      return Promise.resolve(ok(session));
    },

    sendOtp: async (email: string): Promise<Result<void, AppError>> => {
      const result = await managed.requestOtp(email);
      if (result.isErr()) return err(result.error);
      return ok(undefined);
    },

    verifyOtp: async (email: string, code: string): Promise<Result<IpcSession, AppError>> => {
      const result = await managed.submitOtp(email, code);
      if (result.isErr()) return err(result.error);
      await onPostVerify();
      const session = toIpcSession();
      if (!session) {
        return err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: 'Estado inconsistente após verify_otp',
          }),
        );
      }
      return ok(session);
    },

    signOut: async (): Promise<Result<void, AppError>> => {
      await managed.logout();
      return ok(undefined);
    },
  };
}

function createUnavailableAuthService(missingEnv: readonly string[]): AuthService {
  const buildError = (): AppError =>
    new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      message: `Login OTP indisponível. Configure ${missingEnv.join(', ')} em .env na raiz do monorepo (veja .env.example).`,
      context: { missingEnv },
    });

  return {
    getMe: async () => err(AuthError.notAuthenticated()),
    sendOtp: async () => err(buildError()),
    verifyOtp: async () => err(buildError()),
    signOut: async () => ok(undefined),
  };
}

function buildMockAuthRuntime(): AuthRuntime {
  log.warn({}, 'auth-runtime booting in mockAuthMode (G4OS_E2E) — Supabase bypassed');
  const supabase: SupabaseAuthPort = {
    signInWithOtp: () => Promise.reject(new Error('mockAuthMode: signInWithOtp disabled')),
    verifyOtp: () => Promise.reject(new Error('mockAuthMode: verifyOtp disabled')),
    refreshSession: () => Promise.reject(new Error('mockAuthMode: refreshSession disabled')),
  };
  const seed = {
    [AUTH_ACCESS_TOKEN_KEY]: 'e2e-access-token',
    [AUTH_SESSION_META_KEY]: JSON.stringify({
      userId: '00000000-0000-0000-0000-00000000e2e0',
      email: 'e2e@g4os.test',
      expiresAt: Date.now() + 60 * 60 * 1000,
    }),
  };
  const tokenStore: AuthTokenStore = createSeededTokenStore(seed);
  const managedLogin = new ManagedLoginService({ supabase, tokenStore });
  const refresher = new SessionRefresher({ supabase, tokenStore });
  const service = createAuthServiceFromManagedLogin(managedLogin, async () => {
    await refresher.refreshNow();
  });
  void managedLogin.restore();
  return {
    service,
    configured: true,
    missingEnv: [],
    filesLoaded: [],
    managedLogin,
    refresher,
    dispose: () => {
      refresher.dispose();
      managedLogin.dispose();
    },
  };
}

function createSeededTokenStore(seed: Readonly<Record<string, string>>): AuthTokenStore {
  const base = createInMemoryTokenStore();
  for (const [key, value] of Object.entries(seed)) void base.set(key, value);
  return base;
}
