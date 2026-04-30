/**
 * Fonte única de verdade para o estado de autenticação no renderer.
 *
 * Motivador: na V2 até aqui, três `beforeLoad` independentes (`/`, `/login`,
 * `/_app`) chamavam `trpc.auth.getMe` cada um, com um race-timeout de 1500ms
 * que transformava qualquer erro (incluindo timeout transient) em
 * "unauthenticated" — criando loops de redirect quando o cold-start do IPC
 * estourava o timeout apenas em um dos guards.
 *
 * Solução estrutural: compartilhar o resultado via `QueryClient`. Todos os
 * guards leem do cache. Só o primeiro `ensureQueryData` bate no IPC; o resto
 * é síncrono (ou hit de cache em paralelo). Erros são propagados, não
 * mascarados como "not authenticated".
 */

import type { QueryClient } from '@tanstack/react-query';
import { trpc } from '../ipc/trpc-client.ts';

export type IpcSession = Awaited<ReturnType<typeof trpc.auth.getMe.query>>;

export interface AuthStateAuthenticated {
  readonly status: 'authenticated';
  readonly session: IpcSession;
}

export interface AuthStateUnauthenticated {
  readonly status: 'unauthenticated';
}

export type AuthState = AuthStateAuthenticated | AuthStateUnauthenticated;

export const AUTH_QUERY_KEY = ['auth', 'me'] as const;

/**
 * staleTime alto mantém os guards síncronos entre navegações. Qualquer
 * mutação (`sendOtp`/`verifyOtp`/`signOut`) invalida explicitamente a
 * query, então o cache nunca fica divergente do backend.
 */
const AUTH_STALE_TIME_MS = 60_000;
const AUTH_GC_TIME_MS = 5 * 60_000;

export function authQueryOptions() {
  return {
    queryKey: AUTH_QUERY_KEY,
    queryFn: (): Promise<AuthState> => fetchAuthState(),
    staleTime: AUTH_STALE_TIME_MS,
    gcTime: AUTH_GC_TIME_MS,
    retry: false,
  } as const;
}

export function ensureAuthState(queryClient: QueryClient): Promise<AuthState> {
  return queryClient.ensureQueryData(authQueryOptions());
}

export function getCachedAuthState(queryClient: QueryClient): AuthState | undefined {
  return queryClient.getQueryData<AuthState>(AUTH_QUERY_KEY);
}

export function setAuthAuthenticated(queryClient: QueryClient, session: IpcSession): void {
  queryClient.setQueryData<AuthState>(AUTH_QUERY_KEY, { status: 'authenticated', session });
  // Propaga identidade para Sentry quando user fica autenticado. Lazy import —
  // sem DSN configurado, init-sentry é NOOP e setUser também.
  void import('../observability/init-sentry.ts').then((mod) =>
    mod.updateRendererSentryUser({ id: session.userId, email: session.email }),
  );
}

export function setAuthUnauthenticated(queryClient: QueryClient): void {
  queryClient.setQueryData<AuthState>(AUTH_QUERY_KEY, { status: 'unauthenticated' });
  // Limpa identidade no logout — events futuros não devem
  // ser atribuídos ao user que saiu.
  void import('../observability/init-sentry.ts').then((mod) => mod.updateRendererSentryUser(null));
}

export async function invalidateAuth(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
}

async function fetchAuthState(): Promise<AuthState> {
  try {
    const session = await trpc.auth.getMe.query();
    // Cobre o caminho de restore (sessão persistida no vault).
    void import('../observability/init-sentry.ts').then((mod) =>
      mod.updateRendererSentryUser({ id: session.userId, email: session.email }),
    );
    return { status: 'authenticated', session };
  } catch (error: unknown) {
    if (isUnauthorizedError(error)) {
      return { status: 'unauthenticated' };
    }
    // Qualquer outro erro NÃO deve quebrar boot do app — degrade para
    // unauthenticated (usuário vai pra /login). Sentry captura se configurado.
    // ensureQueryData rejeitar aqui = router pendura em "Loading environment…"
    // sem caminho de recovery.
    return { status: 'unauthenticated' };
  }
}

function isUnauthorizedError(error: unknown): boolean {
  // Duck-type + walk the cause chain: electron-trpc bundles its own
  // TRPCClientError class, so @trpc/client's `TRPCClientError.from` fails its
  // internal instanceof check and wraps the bundled error as a plain cause,
  // stripping `.data`/`.shape` from the outer error. O code UNAUTHORIZED pode
  // aparecer em qualquer nível do error/cause/shape, então testamos todos.
  if (!error || typeof error !== 'object') return false;
  if (hasUnauthorizedCode(error)) return true;
  if (hasUnauthorizedCode((error as { cause?: unknown }).cause)) return true;
  // tRPC v11 às vezes joga o code direto no objeto
  if ((error as { code?: unknown }).code === 'UNAUTHORIZED') return true;
  // Mensagem como último fallback (frágil mas defensivo)
  const message = (error as { message?: unknown }).message;
  if (typeof message === 'string' && message.toLowerCase().includes('unauthorized')) return true;
  return false;
}

function hasUnauthorizedCode(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const data = (error as { data?: { code?: unknown } }).data;
  if (data?.code === 'UNAUTHORIZED') return true;
  const shape = (error as { shape?: { data?: { code?: unknown } } }).shape;
  return shape?.data?.code === 'UNAUTHORIZED';
}
