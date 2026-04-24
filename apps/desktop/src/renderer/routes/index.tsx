import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@g4os/features/workspaces';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { ensureAuthState } from '../auth/auth-store.ts';

function readActiveWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const auth = await ensureAuthState(context.queryClient);
    if (auth.status !== 'authenticated') {
      throw redirect({ to: '/login' });
    }
    const activeWorkspaceId = readActiveWorkspaceId();
    if (activeWorkspaceId && activeWorkspaceId.length > 0) {
      throw redirect({
        to: '/workspaces/$workspaceId',
        params: { workspaceId: activeWorkspaceId },
      });
    }
    throw redirect({ to: '/workspaces/' });
  },
  component: () => null,
});
