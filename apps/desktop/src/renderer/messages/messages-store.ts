import type { Message } from '@g4os/kernel/types';
import type { QueryClient } from '@tanstack/react-query';
import { trpc } from '../ipc/trpc-client.ts';

const STALE_TIME_MS = 10_000;
const GC_TIME_MS = 5 * 60_000;

export const messagesListKey = (sessionId: string) => ['messages', 'list', sessionId] as const;

export function messagesListQueryOptions(sessionId: string) {
  return {
    queryKey: messagesListKey(sessionId),
    queryFn: async (): Promise<readonly Message[]> => trpc.messages.list.query({ sessionId }),
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
  } as const;
}

export async function invalidateMessages(
  queryClient: QueryClient,
  sessionId: string,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: messagesListKey(sessionId) });
}
