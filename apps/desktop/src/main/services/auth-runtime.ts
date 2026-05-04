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
import type { AuthService } from '@g4os/ipc/server';
import { createLogger } from '@g4os/kernel/logger';
import {
  createAuthServiceFromManagedLogin,
  createUnavailableAuthService,
  type WipeFn,
} from './auth-service-impl.ts';
import { createInMemoryTokenStore, createVaultBackedTokenStore } from './auth-token-store.ts';
import { ManagedLoginRequiredHub } from './managed-login-required-hub.ts';

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
  /**
   * Callback que executa o reset destrutivo (apagar workspaces, credenciais,
   * preferences). Injetado por `index.ts` para evitar que o runtime de auth
   * conheça o resto do sistema (vault, workspacesService, AppPaths). Quando
   * ausente, `wipeAndReset` retorna erro indicando que reset não é suportado.
   */
  readonly performWipe?: WipeFn;
}

export interface AuthRuntime {
  readonly service: AuthService;
  readonly configured: boolean;
  readonly missingEnv: readonly string[];
  readonly filesLoaded: readonly string[];
  readonly managedLogin?: ManagedLoginService;
  readonly refresher?: SessionRefresher;
  /**
   * Notifica todos os subscribers de `auth.managedLoginRequired` que um
   * re-login é necessário. Chamado por outros módulos do main quando
   * detectam token expirado/revogado fora do fluxo normal de OTP.
   */
  notifyManagedLoginRequired(reason: string): void;
  dispose(): void;
}

export function createAuthRuntime(options: AuthRuntimeOptions): AuthRuntime {
  const filesLoaded: string[] = [];
  const reauthHub = new ManagedLoginRequiredHub();

  if (options.mockAuthMode === true) {
    return buildMockAuthRuntime(reauthHub, options.performWipe);
  }

  const combined: Record<string, string | undefined> = { ...(options.envSource ?? {}) };

  if (options.skipDotEnv !== true) {
    const loaded = loadSupabaseEnvFiles(options.rootDir);
    filesLoaded.push(...loaded.filesLoaded);
    for (const [k, v] of Object.entries(loaded.env)) {
      if (combined[k] === undefined) combined[k] = v;
    }
  }

  // Em build empacotado, .env não existe e process.env vem vazio. Constantes
  // injetadas em build time (electron.vite.config.ts → define) preenchem o
  // gap. SUPABASE_ANON_KEY é desenhada para ser pública (RLS no servidor).
  const buildTimeUrl = readBuildTimeConst('__G4OS_SUPABASE_URL__');
  const buildTimeKey = readBuildTimeConst('__G4OS_SUPABASE_ANON_KEY__');
  if (buildTimeUrl && combined['SUPABASE_URL'] === undefined) {
    combined['SUPABASE_URL'] = buildTimeUrl;
  }
  if (buildTimeKey && combined['SUPABASE_ANON_KEY'] === undefined) {
    combined['SUPABASE_ANON_KEY'] = buildTimeKey;
  }

  const validation: SupabaseEnvValidationResult = validateSupabaseEnv(combined);

  if (!validation.ok || !validation.env) {
    log.warn(
      { missing: validation.missing, filesLoaded },
      'supabase env ausente; login OTP fica bloqueado até .env ser configurado',
    );
    return {
      service: createUnavailableAuthService(validation.missing, reauthHub, options.performWipe),
      configured: false,
      missingEnv: validation.missing,
      filesLoaded,
      notifyManagedLoginRequired: (reason) => reauthHub.notify(reason),
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

  // F-CR32-4: `onPostVerify` era `refresher.refreshNow()` — disparava refresh
  // imediato logo após submitOtp, mas o `state$.subscribe(authenticated→start)`
  // abaixo já agenda o próximo refresh com o buffer de 5min correto (ADR-0094).
  // `refreshNow` cancelava o timer recém-criado e rodava Supabase de novo,
  // desperdiçando quota e rotacionando o refresh-token single-use desnecessariamente.
  // `start()` é idempotente (noop se já `running`); `state$` dispara antes do
  // retorno do submitOtp, então `start()` aqui é no-op mas inofensivo.
  const service = createAuthServiceFromManagedLogin(
    managedLogin,
    async () => {
      await refresher.start();
    },
    reauthHub,
    options.performWipe,
  );

  // Start refresher automaticamente quando uma sessão for persistida.
  // F-CR32-2: stop() chamado em logout para que re-login (authenticated de
  // novo) re-arme o schedule. Sem stop(), `running` fica true após o
  // primeiro start() e o guard no início de start() bloqueia o re-arm.
  const subscription = managedLogin.state$.subscribe((state) => {
    if (state.kind === 'authenticated') {
      void refresher.start();
    } else if (state.kind === 'idle') {
      // idle = logout. Para o schedule para que o próximo login re-arme.
      refresher.stop();
    }
  });

  // F-CR51-3: conecta reauth_required do refresher ao hub de notificação.
  // Sem este wire, token expirado em background não notifica o renderer —
  // usuário permanece em estado authenticated falso até hit-401 manual.
  // ADR-0094: refresher emite reauth_required quando refresh falha ou
  // token é muito curto-vivido; reauthHub.notify() dispara
  // `auth.managedLoginRequired` via IPC para o renderer exibir modal.
  const reauthSubscription = refresher.state$.subscribe((state) => {
    if (state.kind === 'reauth_required') {
      reauthHub.notify(state.reason);
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
    notifyManagedLoginRequired: (reason) => reauthHub.notify(reason),
    dispose: () => {
      subscription.unsubscribe();
      reauthSubscription.unsubscribe();
      refresher.dispose();
      managedLogin.dispose();
    },
  };
}

function buildMockAuthRuntime(
  reauthHub: ManagedLoginRequiredHub,
  performWipe: WipeFn | undefined,
): AuthRuntime {
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
  // F-CR32-4 (mock path): mesma correção — onPostVerify usa start() em vez de
  // refreshNow() para não disparar refresh imediato desnecessário.
  const service = createAuthServiceFromManagedLogin(
    managedLogin,
    async () => {
      await refresher.start();
    },
    reauthHub,
    performWipe,
  );
  void managedLogin.restore();
  return {
    service,
    configured: true,
    missingEnv: [],
    filesLoaded: [],
    managedLogin,
    refresher,
    notifyManagedLoginRequired: (reason) => reauthHub.notify(reason),
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

/**
 * Lê constante embutida em build time pelo electron-vite (define). Quando a
 * constante não foi substituída (dev sem build, ou JIT), o nome literal
 * sobrevive — neste caso retornamos vazio para evitar usá-lo como valor.
 */
declare const __G4OS_SUPABASE_URL__: string;
declare const __G4OS_SUPABASE_ANON_KEY__: string;

function readBuildTimeConst(name: '__G4OS_SUPABASE_URL__' | '__G4OS_SUPABASE_ANON_KEY__'): string {
  try {
    const raw =
      name === '__G4OS_SUPABASE_URL__' ? __G4OS_SUPABASE_URL__ : __G4OS_SUPABASE_ANON_KEY__;
    if (typeof raw !== 'string') return '';
    if (raw === name) return '';
    return raw;
  } catch {
    return '';
  }
}
