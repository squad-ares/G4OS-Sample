import {
  useActiveWorkspaceId,
  useSetActiveWorkspaceId,
  WorkspaceDeleteDialog,
  type WorkspaceListItemStats,
  WorkspaceListPanel,
} from '@g4os/features/workspaces';
import type { Workspace } from '@g4os/kernel/types';
import { toast, useTranslate } from '@g4os/ui';
import { useQueries, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { queryClient } from '../../ipc/query-client.ts';
import { trpc } from '../../ipc/trpc-client.ts';
import {
  invalidateWorkspaces,
  workspacesListQueryOptions,
} from '../../workspaces/workspaces-store.ts';

export const Route = createFileRoute('/_app/workspaces/')({
  component: WorkspacesIndex,
});

function WorkspacesIndex() {
  const { t } = useTranslate();
  const navigate = useNavigate();
  const { data: workspaces = [], isLoading } = useQuery(workspacesListQueryOptions());
  const activeWorkspaceId = useActiveWorkspaceId();
  const setActiveWorkspaceId = useSetActiveWorkspaceId();

  const [pendingDelete, setPendingDelete] = useState<Workspace | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sessionsQueries = useQueries({
    queries: workspaces.map((w) => ({
      queryKey: ['workspaces', 'stats', 'sessions', w.id],
      queryFn: () =>
        trpc.sessions.listFiltered.query({
          workspaceId: w.id,
          lifecycle: 'active',
          includeBranches: false,
          limit: 50,
          offset: 0,
        }),
      staleTime: 30_000,
    })),
  });

  const projectsQueries = useQueries({
    queries: workspaces.map((w) => ({
      queryKey: ['workspaces', 'stats', 'projects', w.id],
      queryFn: () => trpc.projects.list.query({ workspaceId: w.id }),
      staleTime: 60_000,
    })),
  });

  const statsMap = useMemo(() => {
    const map = new Map<string, WorkspaceListItemStats>();
    workspaces.forEach((w, i) => {
      const sessionsResult = sessionsQueries[i]?.data;
      const projectsResult = projectsQueries[i]?.data;
      const items = sessionsResult?.items ?? [];
      const sessionCount = sessionsResult?.total ?? items.length;
      const projectCount = projectsResult?.length;
      const lastActivityAt = items.reduce<number>((acc, s) => {
        const ts = s.lastMessageAt ?? s.updatedAt;
        return ts > acc ? ts : acc;
      }, 0);

      const stats: WorkspaceListItemStats = {};
      if (sessionsResult) (stats as { sessionCount?: number }).sessionCount = sessionCount;
      if (typeof projectCount === 'number')
        (stats as { projectCount?: number }).projectCount = projectCount;
      if (lastActivityAt > 0)
        (stats as { lastActivityAt?: number }).lastActivityAt = lastActivityAt;

      if (Object.keys(stats).length > 0) {
        map.set(w.id, stats);
      }
    });
    return map;
  }, [workspaces, sessionsQueries, projectsQueries]);

  const handleOpen = (id: Workspace['id']) => {
    setActiveWorkspaceId(id);
    void navigate({ to: '/workspaces/$workspaceId', params: { workspaceId: id } });
  };

  const handleDelete = async ({ removeFiles }: { removeFiles: boolean }) => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await trpc.workspaces.delete.mutate({ id: pendingDelete.id, removeFiles });
      await invalidateWorkspaces(queryClient);
      if (activeWorkspaceId === pendingDelete.id) {
        setActiveWorkspaceId(null);
      }
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleExport = async (id: Workspace['id']) => {
    const workspace = workspaces.find((w) => w.id === id);
    if (!workspace) return;

    const dialog = await trpc.platform.showSaveDialog.mutate({
      title: t('workspace.export.dialogTitle'),
      defaultPath: `${workspace.slug}.g4os-workspace.zip`,
      filters: [{ name: 'G4OS Workspace', extensions: ['zip'] }],
    });
    if (dialog.canceled || !dialog.filePath) return;

    try {
      const summary = await trpc.workspaceTransfer.exportWorkspace.mutate({
        workspaceId: workspace.id,
        outputPath: dialog.filePath,
      });
      toast.success(
        t('workspace.export.success', {
          path: summary.path,
          files: String(summary.filesIncluded),
        }),
      );
    } catch (error) {
      toast.error(
        t('workspace.export.failed', {
          reason: error instanceof Error ? error.message : 'unknown',
        }),
      );
    }
  };

  const handleImport = async () => {
    const dialog = await trpc.platform.showOpenDialog.mutate({
      title: t('workspace.import.dialogTitle'),
      filters: [{ name: 'G4OS Workspace', extensions: ['zip'] }],
    });
    if (dialog.canceled || dialog.filePaths.length === 0) return;

    const [zipPath] = dialog.filePaths;
    if (!zipPath) return;

    try {
      const summary = await trpc.workspaceTransfer.importWorkspace.mutate({ zipPath });
      await invalidateWorkspaces(queryClient);
      if (summary.warnings.length > 0) {
        toast.warning(
          t('workspace.import.successWithWarnings', {
            count: String(summary.warnings.length),
          }),
        );
      } else {
        toast.success(t('workspace.import.success'));
      }
    } catch (error) {
      toast.error(
        t('workspace.import.failed', {
          reason: error instanceof Error ? error.message : 'unknown',
        }),
      );
    }
  };

  return (
    <>
      <WorkspaceListPanel
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        isLoading={isLoading}
        stats={statsMap}
        onOpen={handleOpen}
        onOpenInNewWindow={(id) => {
          void trpc.windows.openWorkspaceWindow.mutate({ workspaceId: id });
        }}
        onCreate={() => {
          void navigate({ to: '/workspaces/new' });
        }}
        onDelete={(id) => {
          const target = workspaces.find((w) => w.id === id) ?? null;
          setPendingDelete(target);
        }}
        onExport={(id) => {
          void handleExport(id);
        }}
        onImport={() => {
          void handleImport();
        }}
      />
      <WorkspaceDeleteDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        workspace={pendingDelete}
        deleting={deleting}
        onConfirm={handleDelete}
      />
    </>
  );
}
