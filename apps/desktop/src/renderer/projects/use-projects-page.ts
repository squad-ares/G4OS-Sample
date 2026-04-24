import type {
  LegacyImportEntry,
  LegacyProject,
  Project,
  ProjectCreateInput,
} from '@g4os/kernel/types';
import { toast } from '@g4os/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { queryClient } from '../ipc/query-client.ts';
import { trpc } from '../ipc/trpc-client.ts';
import {
  invalidateProjects,
  legacyCheckQueryOptions,
  legacyDiscoverQueryOptions,
  projectsListQueryOptions,
} from './projects-store.ts';

export interface LegacyCheckState {
  readonly needsReview: boolean;
  readonly projects: readonly LegacyProject[];
  readonly apply: (entries: readonly LegacyImportEntry[]) => Promise<void>;
  readonly cancel: () => void;
  readonly isApplying: boolean;
}

export interface ProjectsPageState {
  readonly projects: readonly Project[];
  readonly isLoading: boolean;
  readonly create: (input: ProjectCreateInput) => Promise<void>;
  readonly archive: (id: string) => void;
  readonly softDelete: (id: string) => void;
  readonly legacyCheck: LegacyCheckState;
}

export function useProjectsPage(workspaceId: string, workingDirectory: string): ProjectsPageState {
  const [legacyDismissed, setLegacyDismissed] = useState(false);

  const listQuery = useQuery(projectsListQueryOptions(workspaceId));
  const legacyDoneQuery = useQuery(legacyCheckQueryOptions(workspaceId));

  const legacyEnabled =
    legacyDoneQuery.data === false && workingDirectory.length > 0 && !legacyDismissed;

  const discoverQuery = useQuery({
    ...legacyDiscoverQueryOptions(workspaceId, workingDirectory),
    enabled: legacyEnabled,
  });

  const invalidate = useCallback(() => invalidateProjects(queryClient), []);

  const createMutation = useMutation({
    mutationFn: (input: ProjectCreateInput) => trpc.projects.create.mutate(input),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(String(err)),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => trpc.projects.archive.mutate({ id }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(String(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => trpc.projects.delete.mutate({ id }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(String(err)),
  });

  const importMutation = useMutation({
    mutationFn: (entries: readonly LegacyImportEntry[]) =>
      trpc.projects.importLegacyProjects.mutate({
        workspaceId,
        entries: entries.map((e) => ({
          path: e.path,
          name: e.name,
          slug: e.slug,
          ...(e.existingId === undefined ? {} : { existingId: e.existingId }),
          ...(e.description === undefined ? {} : { description: e.description }),
          decision: e.decision,
        })),
      }),
    onSuccess: () => {
      setLegacyDismissed(true);
      invalidate();
    },
    onError: (err) => toast.error(String(err)),
  });

  const discoveredProjects = useMemo(
    () => (legacyEnabled ? (discoverQuery.data ?? []) : []),
    [legacyEnabled, discoverQuery.data],
  );

  const needsReview = legacyEnabled && discoveredProjects.length > 0 && !legacyDismissed;

  return {
    projects: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    create: async (input) => {
      await createMutation.mutateAsync(input);
    },
    archive: (id) => {
      void archiveMutation.mutateAsync(id);
    },
    softDelete: (id) => {
      void deleteMutation.mutateAsync(id);
    },
    legacyCheck: {
      needsReview,
      projects: discoveredProjects,
      apply: async (entries) => {
        await importMutation.mutateAsync(entries);
      },
      cancel: () => setLegacyDismissed(true),
      isApplying: importMutation.isPending,
    },
  };
}
