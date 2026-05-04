import { BackupCategory } from '@g4os/features/settings';
import { toast, useTranslate } from '@g4os/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { trpc } from '../../ipc/trpc-client.ts';
import { workspacesListQueryOptions } from '../../workspaces/workspaces-store.ts';

const BACKUP_LIST_KEY = ['backup', 'list'] as const;

/**
 * Wiring real do `BackupCategory`. List + runNow + delete via tRPC,
 * showItemInFolder via `platform.showItemInFolder`.
 */
export function BackupCategoryContainer() {
  const { t } = useTranslate();
  const [runningWorkspaceId, setRunningWorkspaceId] = useState<string | null>(null);

  const listQuery = useQuery({
    queryKey: BACKUP_LIST_KEY,
    queryFn: () => trpc.backup.list.query(),
    staleTime: 30_000,
  });

  const workspacesQuery = useQuery(workspacesListQueryOptions());

  const runNowMutation = useMutation({
    mutationFn: (workspaceId: string) => trpc.backup.runNow.mutate({ workspaceId }),
    onMutate: (workspaceId) => {
      setRunningWorkspaceId(workspaceId);
    },
    onSuccess: async () => {
      await listQuery.refetch();
      toast.success(t('settings.backup.runNow.success'));
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('settings.backup.runNow.failed', { message: msg }));
    },
    onSettled: () => {
      setRunningWorkspaceId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (path: string) => trpc.backup.delete.mutate({ path }),
    onSuccess: async () => {
      await listQuery.refetch();
      toast.success(t('settings.backup.delete.success'));
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('settings.backup.delete.failed', { message: msg }));
    },
  });

  const handleReveal = (path: string) => {
    void trpc.platform.showItemInFolder.mutate({ path }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t('settings.backup.list.revealFailed', { message: msg }));
    });
  };

  return (
    <BackupCategory
      entries={listQuery.data ?? []}
      workspaces={(workspacesQuery.data ?? []).map((w) => ({ id: w.id, name: w.name }))}
      isLoading={listQuery.isLoading}
      runningWorkspaceId={runningWorkspaceId}
      onRunNow={(workspaceId) => runNowMutation.mutate(workspaceId)}
      onDelete={(path) => deleteMutation.mutate(path)}
      onReveal={handleReveal}
    />
  );
}
