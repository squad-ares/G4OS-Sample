import { OnboardingWizard } from '@g4os/features/onboarding';
import { createFileRoute, useNavigate } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/onboarding')({
  component: OnboardingRoute,
});

function OnboardingRoute() {
  const navigate = useNavigate();

  return (
    <OnboardingWizard
      ports={{
        createWorkspace: ({ name }) =>
          Promise.resolve({ id: `ws_${name.toLowerCase().replace(/\s+/gu, '-')}` }),
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
