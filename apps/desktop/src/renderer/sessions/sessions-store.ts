import type { GlobalSearchResult, Session, SessionFilter } from '@g4os/kernel/types';
import type { QueryClient } from '@tanstack/react-query';
import { trpc } from '../ipc/trpc-client.ts';

const STALE_TIME_MS = 15_000;
const GC_TIME_MS = 5 * 60_000;

export const sessionsListKey = (filter: SessionFilter) => ['sessions', 'list', filter] as const;

export const sessionKey = (id: string) => ['sessions', 'detail', id] as const;

export const globalSearchKey = (workspaceId: string, query: string) =>
  ['sessions', 'search', workspaceId, query] as const;

export function sessionsListQueryOptions(filter: SessionFilter) {
  return {
    queryKey: sessionsListKey(filter),
    queryFn: async () => {
      const page = await trpc.sessions.listFiltered.query(filter);
      return {
        items: [...page.items] as readonly Session[],
        total: page.total,
        hasMore: page.hasMore,
      };
    },
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
  } as const;
}

export function globalSearchQueryOptions(workspaceId: string, query: string) {
  return {
    queryKey: globalSearchKey(workspaceId, query),
    queryFn: (): Promise<GlobalSearchResult> => {
      if (query.trim().length === 0) {
        return Promise.resolve({ messages: [], sessions: [] });
      }
      return trpc.sessions.globalSearch.query({ workspaceId, query });
    },
    staleTime: 5_000,
    gcTime: 60_000,
    enabled: query.trim().length > 0,
  } as const;
}

export async function invalidateSessions(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['sessions', 'list'] });
}
