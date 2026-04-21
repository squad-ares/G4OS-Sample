import type {
  SupabaseAuthPort,
  SupabaseOtpResult,
  SupabaseRefreshResult,
  SupabaseVerifyResult,
} from '../types.ts';
import type { SupabaseEnv } from './env.ts';

/**
 * Contrato mínimo do cliente Supabase que o adapter usa. Fica fora de
 * `@supabase/supabase-js` para manter o pacote `@g4os/auth` livre de dep
 * runtime ao SDK (o SDK é carregado via `import(...)` dinâmico no main).
 */
export interface SupabaseClientLike {
  readonly auth: {
    signInWithOtp(args: {
      email: string;
      options?: { shouldCreateUser?: boolean };
    }): Promise<SupabaseOtpResult>;
    verifyOtp(args: {
      email: string;
      token: string;
      type: 'email' | 'signup' | 'magiclink';
    }): Promise<SupabaseVerifyResult>;
    refreshSession(args: { refresh_token: string }): Promise<SupabaseRefreshResult>;
  };
}

export type SupabaseClientFactory = (env: SupabaseEnv) => Promise<SupabaseClientLike>;

export interface CreateSupabaseAdapterOptions {
  readonly env: SupabaseEnv;
  /** Injeção para testes. Em produção, o desktop fornece o factory real. */
  readonly clientFactory: SupabaseClientFactory;
}

/**
 * Devolve um `SupabaseAuthPort` que fala com o SDK real (ou com um fake em
 * testes) sem expor detalhes do cliente para cima. O cliente é lazy — só
 * instanciado na primeira chamada — mas é reusado entre chamadas.
 */
export function createSupabaseAdapter(options: CreateSupabaseAdapterOptions): SupabaseAuthPort {
  let clientPromise: Promise<SupabaseClientLike> | null = null;

  const getClient = (): Promise<SupabaseClientLike> => {
    if (clientPromise === null) {
      clientPromise = options.clientFactory(options.env);
    }
    return clientPromise;
  };

  return {
    signInWithOtp: async (input) => {
      const client = await getClient();
      return client.auth.signInWithOtp({
        email: input.email,
        ...(input.shouldCreateUser === undefined
          ? {}
          : { options: { shouldCreateUser: input.shouldCreateUser } }),
      });
    },
    verifyOtp: async (input) => {
      const client = await getClient();
      return client.auth.verifyOtp({
        email: input.email,
        token: input.token,
        type: input.type,
      });
    },
    refreshSession: async (input) => {
      const client = await getClient();
      return client.auth.refreshSession({ refresh_token: input.refreshToken });
    },
  };
}

/**
 * Factory padrão para o SDK oficial `@supabase/supabase-js`. Faz import
 * dinâmico para evitar bundle do SDK em pacotes que não são `main`.
 */
export const defaultSupabaseClientFactory: SupabaseClientFactory = async (env) => {
  const specifier = '@supabase/supabase-js';
  interface SupabaseModule {
    createClient: (url: string, key: string) => SupabaseClientLike;
  }
  const mod = (await import(/* @vite-ignore */ specifier)) as SupabaseModule;
  return mod.createClient(env.url, env.key);
};
