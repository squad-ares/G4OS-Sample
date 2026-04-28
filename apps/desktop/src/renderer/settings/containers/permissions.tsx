import { PermissionsCategory } from '@g4os/features/settings';
import { useActiveWorkspaceId } from '@g4os/features/workspaces';
import { toast, useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { trpc } from '../../ipc/trpc-client.ts';

export function PermissionsCategoryContainer() {
  const { t } = useTranslate();
  const workspaceId = useActiveWorkspaceId();

  const sessionsQuery = useQuery({
    queryKey: ['sessions', 'list', workspaceId ?? ''],
    queryFn: () => trpc.sessions.list.query({ workspaceId: workspaceId ?? '' }),
    staleTime: 5_000,
    enabled: Boolean(workspaceId),
  });

  const permissionsQuery = useQuery({
    queryKey: ['permissions', 'list', workspaceId ?? ''],
    queryFn: () => trpc.permissions.list.query({ workspaceId: workspaceId ?? '' }),
    staleTime: 5_000,
    enabled: Boolean(workspaceId),
  });

  const sessions = sessionsQuery.data ?? [];
  const toolDecisions = permissionsQuery.data ?? [];
  const stickyBySession = sessions
    .filter((s) => s.stickyMountedSourceSlugs.length > 0)
    .map((s) => ({
      sessionId: s.id,
      sessionName: s.name,
      sticky: s.stickyMountedSourceSlugs,
    }));
  const rejectedBySession = sessions
    .filter((s) => s.rejectedSourceSlugs.length > 0)
    .map((s) => ({
      sessionId: s.id,
      sessionName: s.name,
      rejected: s.rejectedSourceSlugs,
    }));

  const onClearSession = useCallback(
    async (sessionId: string) => {
      try {
        await trpc.sessions.update.mutate({
          id: sessionId,
          patch: { stickyMountedSourceSlugs: [], rejectedSourceSlugs: [] },
        });
        toast.success(t('settings.permissions.cleared'));
        await sessionsQuery.refetch();
      } catch (err) {
        toast.error(String(err));
      }
    },
    [sessionsQuery, t],
  );

  const onRevokeTool = useCallback(
    async (toolName: string, argsHash: string) => {
      if (!workspaceId) return;
      try {
        await trpc.permissions.revoke.mutate({ workspaceId, toolName, argsHash });
        toast.success(t('settings.permissions.revoked'));
        await permissionsQuery.refetch();
      } catch (err) {
        toast.error(String(err));
      }
    },
    [workspaceId, permissionsQuery, t],
  );

  return (
    <PermissionsCategory
      toolDecisions={toolDecisions}
      onRevokeTool={(toolName, argsHash) => void onRevokeTool(toolName, argsHash)}
      stickyBySession={stickyBySession}
      rejectedBySession={rejectedBySession}
      onClearSession={(id) => void onClearSession(id)}
    />
  );
}
