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
import { TRPCClientError } from '@trpc/client';
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
}

export function setAuthUnauthenticated(queryClient: QueryClient): void {
  queryClient.setQueryData<AuthState>(AUTH_QUERY_KEY, { status: 'unauthenticated' });
}

export async function invalidateAuth(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
}

async function fetchAuthState(): Promise<AuthState> {
  try {
    const session = await trpc.auth.getMe.query();
    return { status: 'authenticated', session };
  } catch (error: unknown) {
    if (isUnauthorizedError(error)) {
      return { status: 'unauthenticated' };
    }
    throw error;
  }
}

function isUnauthorizedError(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    return error.data?.code === 'UNAUTHORIZED' || error.shape?.data?.code === 'UNAUTHORIZED';
  }
  return false;
}
