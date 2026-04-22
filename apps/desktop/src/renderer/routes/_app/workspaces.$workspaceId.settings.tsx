import { WorkspaceSettingsPanel } from '@g4os/features/workspaces';
import { useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router';
import { queryClient } from '../../ipc/query-client.ts';
import { trpc } from '../../ipc/trpc-client.ts';
import {
  invalidateWorkspaces,
  workspacesListQueryOptions,
} from '../../workspaces/workspaces-store.ts';

export const Route = createFileRoute('/_app/workspaces/$workspaceId/settings')({
  component: WorkspaceSettingsRoute,
});

function WorkspaceSettingsRoute() {
  const { t } = useTranslate();
  const navigate = useNavigate();
  const { workspaceId } = useParams({ from: '/_app/workspaces/$workspaceId/settings' });
  const { data: workspaces = [] } = useQuery(workspacesListQueryOptions());
  const workspace = workspaces.find((w) => w.id === workspaceId);

  if (!workspace) {
    return (
      <div className="rounded-2xl border border-dashed border-foreground/12 p-6 text-sm text-muted-foreground">
        {t('workspace.list.loading')}
      </div>
    );
  }

  return (
    <WorkspaceSettingsPanel
      workspace={workspace}
      onSave={async (patch) => {
        await trpc.workspaces.update.mutate({
          id: workspace.id,
          patch: {
            name: patch.name.trim(),
            defaults: patch.defaults,
            ...(patch.metadataTheme ? { metadata: { theme: patch.metadataTheme } } : {}),
          },
        });
        await invalidateWorkspaces(queryClient);
      }}
      onReset={() => {
        void navigate({ to: '/workspaces' });
      }}
      onDelete={() => {
        void navigate({ to: '/workspaces' });
      }}
    />
  );
}
