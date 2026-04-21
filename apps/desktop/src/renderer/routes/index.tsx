import { createFileRoute, redirect } from '@tanstack/react-router';
import { ensureAuthState } from '../auth/auth-store.ts';

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const auth = await ensureAuthState(context.queryClient);
    if (auth.status === 'authenticated') {
      throw redirect({ to: '/workspaces/' });
    }
    throw redirect({ to: '/login' });
  },
  component: () => null,
});
