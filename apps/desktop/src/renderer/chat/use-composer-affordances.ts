import type { WorkingDirOption } from '@g4os/features/chat';
import type { Project, Session, Workspace } from '@g4os/kernel/types';
import { toast, useTranslate } from '@g4os/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { trpc } from '../ipc/trpc-client.ts';

interface UseComposerAffordancesArgs {
  readonly sessionId: string;
  readonly workspace: Workspace | undefined;
  readonly projects: ReadonlyArray<Project> | undefined;
  readonly sessionQuery: UseQueryResult<Session>;
  readonly navigate: ReturnType<typeof useNavigate>;
}

interface UseComposerAffordancesResult {
  readonly workingDirOptions: ReadonlyArray<WorkingDirOption>;
  readonly handleSourceSelectionChange: (slugs: readonly string[]) => Promise<void>;
  readonly handleOpenConnections: () => void;
  readonly handleWorkingDirChange: (path: string | null) => Promise<void>;
  readonly handlePickCustomDir: () => Promise<string | null>;
}

/**
 * Hook que monta callbacks + opções para os pickers do composer (source,
 * working dir). Extraído pra manter o route file abaixo do cap 500 LOC.
 */
export function useComposerAffordances({
  sessionId,
  workspace,
  projects,
  sessionQuery,
  navigate,
}: UseComposerAffordancesArgs): UseComposerAffordancesResult {
  const { t } = useTranslate();

  const workingDirOptions = useMemo<ReadonlyArray<WorkingDirOption>>(() => {
    const options: WorkingDirOption[] = [];
    if (workspace) {
      options.push({
        id: 'workspace-main',
        label: t('chat.workingDir.workspaceRoot'),
        path: workspace.rootPath,
        kind: 'workspace-main',
      });
    }
    for (const project of projects ?? []) {
      options.push({
        id: `project-${project.id}`,
        label: project.name,
        path: project.rootPath,
        kind: 'project',
      });
    }
    return options;
  }, [workspace, projects, t]);

  const handleSourceSelectionChange = useCallback(
    async (slugs: readonly string[]) => {
      try {
        await trpc.sessions.update.mutate({
          id: sessionId,
          patch: { enabledSourceSlugs: [...slugs] },
        });
        await sessionQuery.refetch();
      } catch (err) {
        toast.error(String(err));
      }
    },
    [sessionId, sessionQuery],
  );

  const handleOpenConnections = useCallback(() => {
    void navigate({ to: '/connections' });
  }, [navigate]);

  const handleWorkingDirChange = useCallback(
    async (path: string | null): Promise<void> => {
      try {
        await trpc.sessions.update.mutate({
          id: sessionId,
          patch: { workingDirectory: path ?? undefined },
        });
        toast.success(t('chat.workingDir.saved'));
        await sessionQuery.refetch();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(t('chat.workingDir.saveFailed', { message: msg }));
      }
    },
    [sessionId, sessionQuery, t],
  );

  const handlePickCustomDir = useCallback(async (): Promise<string | null> => {
    try {
      const result = await trpc.platform.showOpenDialog.mutate({
        title: t('chat.workingDir.browse'),
        filters: [],
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0] ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('chat.workingDir.saveFailed', { message: msg }));
      return null;
    }
  }, [t]);

  return {
    workingDirOptions,
    handleSourceSelectionChange,
    handleOpenConnections,
    handleWorkingDirChange,
    handlePickCustomDir,
  };
}
