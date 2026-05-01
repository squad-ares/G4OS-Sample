import { OnboardingWizard } from '@g4os/features/onboarding';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { queryClient } from '../../ipc/query-client.ts';
import { trpc } from '../../ipc/trpc-client.ts';
import { invalidateWorkspaces, setWorkspacesCache } from '../../workspaces/workspaces-store.ts';

export const Route = createFileRoute('/_app/onboarding')({
  component: OnboardingRoute,
});

function OnboardingRoute() {
  const navigate = useNavigate();

  return (
    <OnboardingWizard
      ports={{
        createWorkspace: async ({ name }) => {
          const workspace = await trpc.workspaces.create.mutate({
            name: name.trim(),
            rootPath: '',
          });
          await invalidateWorkspaces(queryClient);
          setWorkspacesCache(queryClient, [workspace]);
          return { id: workspace.id };
        },
        saveCredential: async ({ key, value }) => {
          await trpc.credentials.set.mutate({ key, value });
        },
        createFirstSession: ({ workspaceId }) => Promise.resolve({ id: `sess_${workspaceId}_01` }),
      }}
      onComplete={({ workspaceId, sessionId }) => {
        void navigate({
          to: '/workspaces/$workspaceId/sessions/$sessionId',
          params: { workspaceId, sessionId },
        } as const);
      }}
    />
  );
}
