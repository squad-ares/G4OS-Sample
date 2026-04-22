import type { Workspace } from '@g4os/kernel/types';
import type { QueryClient } from '@tanstack/react-query';
import { trpc } from '../ipc/trpc-client.ts';

export const WORKSPACES_LIST_QUERY_KEY = ['workspaces', 'list'] as const;

const STALE_TIME_MS = 30_000;
const GC_TIME_MS = 5 * 60_000;

export function workspacesListQueryOptions() {
  return {
    queryKey: WORKSPACES_LIST_QUERY_KEY,
    queryFn: async (): Promise<readonly Workspace[]> => {
      const rows = await trpc.workspaces.list.query();
      return rows as readonly Workspace[];
    },
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
  } as const;
}

export async function invalidateWorkspaces(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: WORKSPACES_LIST_QUERY_KEY });
}

export function setWorkspacesCache(
  queryClient: QueryClient,
  workspaces: readonly Workspace[],
): void {
  queryClient.setQueryData<readonly Workspace[]>(WORKSPACES_LIST_QUERY_KEY, workspaces);
}

export function getCachedWorkspaces(queryClient: QueryClient): readonly Workspace[] | undefined {
  return queryClient.getQueryData<readonly Workspace[]>(WORKSPACES_LIST_QUERY_KEY);
}
