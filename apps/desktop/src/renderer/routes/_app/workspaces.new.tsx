import { WorkspaceSetupWizard } from '@g4os/features/workspaces';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { queryClient } from '../../ipc/query-client.ts';
import { trpc } from '../../ipc/trpc-client.ts';
import { invalidateWorkspaces } from '../../workspaces/workspaces-store.ts';

export const Route = createFileRoute('/_app/workspaces/new')({
  component: NewWorkspaceRoute,
});

function NewWorkspaceRoute() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);

  return (
    <WorkspaceSetupWizard
      submitting={submitting}
      onCancel={() => {
        void navigate({ to: '/workspaces' });
      }}
      onSubmit={async (draft) => {
        setSubmitting(true);
        try {
          const workspace = await trpc.workspaces.create.mutate({
            name: draft.name.trim(),
            rootPath: draft.workingDirectory.trim(),
          });

          const selectedColor = draft.color;
          await trpc.workspaces.update.mutate({
            id: workspace.id,
            patch: {
              defaults: {
                permissionMode: resolvePermissionMode(draft.defaults.permissionPreset),
                ...(draft.workingDirectory.trim()
                  ? { workingDirectory: draft.workingDirectory.trim() }
                  : {}),
              },
              metadata: {
                theme: selectedColor,
              },
              setupCompleted: true,
              styleSetupCompleted: !draft.styleInterview.skip,
            },
          });
          await invalidateWorkspaces(queryClient);
          return { workspaceId: workspace.id };
        } finally {
          setSubmitting(false);
        }
      }}
      onComplete={({ workspaceId }) => {
        void navigate({ to: '/workspaces' });
        void workspaceId;
      }}
    />
  );
}

function resolvePermissionMode(
  preset: 'permissive' | 'balanced' | 'strict',
): 'allow-all' | 'ask' | 'safe' {
  if (preset === 'permissive') return 'allow-all';
  if (preset === 'strict') return 'safe';
  return 'ask';
}
