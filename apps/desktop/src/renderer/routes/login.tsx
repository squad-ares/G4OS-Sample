import { LoginPage, useLoginController } from '@g4os/features/auth';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { ensureAuthState, invalidateAuth, setAuthAuthenticated } from '../auth/auth-store.ts';
import { queryClient } from '../ipc/query-client.ts';
import { trpc } from '../ipc/trpc-client.ts';

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ context }) => {
    const auth = await ensureAuthState(context.queryClient);
    if (auth.status === 'authenticated') {
      throw redirect({ to: '/workspaces/' });
    }
  },
  component: LoginRoute,
});

function LoginRoute() {
  const navigate = useNavigate();
  const controller = useLoginController({
    sendOtp: async (email) => {
      await trpc.auth.sendOtp.mutate({ email });
    },
    verifyOtp: async (email, code) => {
      const session = await trpc.auth.verifyOtp.mutate({ email, code });
      setAuthAuthenticated(queryClient, session);
    },
  });

  useEffect(() => {
    if (controller.state.kind === 'authenticated') {
      void invalidateAuth(queryClient).then(() => navigate({ to: '/workspaces/' }));
    }
  }, [controller.state, navigate]);

  return <LoginPage controller={controller} />;
}
