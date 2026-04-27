import type { Project, ProjectFile, ProjectTask, Session } from '@g4os/kernel/types';
import type { QueryClient } from '@tanstack/react-query';
import { trpc } from '../ipc/trpc-client.ts';

const STALE_TIME_MS = 15_000;
const GC_TIME_MS = 5 * 60_000;

export const projectsListKey = (workspaceId: string) => ['projects', 'list', workspaceId] as const;

export const projectDetailKey = (id: string) => ['projects', 'detail', id] as const;

export const projectFilesKey = (id: string) => ['projects', 'files', id] as const;

export const projectTasksKey = (id: string) => ['projects', 'tasks', id] as const;

export const projectSessionsKey = (id: string) => ['projects', 'sessions', id] as const;

export const legacyCheckKey = (workspaceId: string) =>
  ['projects', 'legacy-check', workspaceId] as const;

export const legacyDiscoverKey = (workspaceId: string, workingDirectory: string) =>
  ['projects', 'legacy-discover', workspaceId, workingDirectory] as const;

export function projectsListQueryOptions(workspaceId: string) {
  return {
    queryKey: projectsListKey(workspaceId),
    queryFn: async (): Promise<readonly Project[]> => trpc.projects.list.query({ workspaceId }),
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    enabled: workspaceId.length > 0,
  } as const;
}

export function projectDetailQueryOptions(id: string) {
  return {
    queryKey: projectDetailKey(id),
    queryFn: async (): Promise<Project> => trpc.projects.get.query({ id }),
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
  } as const;
}

export function projectFilesQueryOptions(projectId: string) {
  return {
    queryKey: projectFilesKey(projectId),
    queryFn: async (): Promise<readonly ProjectFile[]> =>
      trpc.projects.listFiles.query({ projectId }),
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
  } as const;
}

export function projectTasksQueryOptions(projectId: string) {
  return {
    queryKey: projectTasksKey(projectId),
    queryFn: async (): Promise<readonly ProjectTask[]> =>
      trpc.projects.listTasks.query({ projectId }),
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
  } as const;
}

export function projectSessionsQueryOptions(projectId: string) {
  return {
    queryKey: projectSessionsKey(projectId),
    queryFn: async (): Promise<readonly Session[]> =>
      trpc.projects.listSessions.query({ projectId }),
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
  } as const;
}

export function legacyCheckQueryOptions(workspaceId: string) {
  return {
    queryKey: legacyCheckKey(workspaceId),
    queryFn: async (): Promise<boolean> => trpc.projects.hasLegacyImportDone.query({ workspaceId }),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: GC_TIME_MS,
    enabled: workspaceId.length > 0,
  } as const;
}

export function legacyDiscoverQueryOptions(workspaceId: string, workingDirectory: string) {
  return {
    queryKey: legacyDiscoverKey(workspaceId, workingDirectory),
    queryFn: () => trpc.projects.discoverLegacyProjects.query({ workspaceId, workingDirectory }),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: GC_TIME_MS,
    enabled: workspaceId.length > 0 && workingDirectory.length > 0,
  } as const;
}

export async function invalidateProjects(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ['projects'] });
}

export async function invalidateProjectDetail(queryClient: QueryClient, id: string): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: projectDetailKey(id) });
  await queryClient.invalidateQueries({ queryKey: projectFilesKey(id) });
  await queryClient.invalidateQueries({ queryKey: projectTasksKey(id) });
  await queryClient.invalidateQueries({ queryKey: projectSessionsKey(id) });
}
