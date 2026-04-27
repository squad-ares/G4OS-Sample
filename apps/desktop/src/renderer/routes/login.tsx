import { LoginPage, ResetConfirmationDialog, useLoginController } from '@g4os/features/auth';
import { toast, useTranslate } from '@g4os/ui';
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ensureAuthState, invalidateAuth, setAuthAuthenticated } from '../auth/auth-store.ts';
import { queryClient } from '../ipc/query-client.ts';
import { trpc } from '../ipc/trpc-client.ts';

interface LoginSearchParams {
  /**
   * Quando `'1'`, indica que o usuário caiu aqui via expiração de sessão.
   * `LoginPage` usa modo `reauth` (ícone de alerta + cópia diferente).
   */
  readonly reauth?: '1';
  readonly email?: string;
}

function parseLoginSearch(input: Record<string, unknown>): LoginSearchParams {
  const out: LoginSearchParams = {};
  if (input['reauth'] === '1') (out as { reauth?: '1' }).reauth = '1';
  if (typeof input['email'] === 'string') {
    (out as { email?: string }).email = input['email'];
  }
  return out;
}

export const Route = createFileRoute('/login')({
  validateSearch: parseLoginSearch,
  beforeLoad: async ({ context, search }) => {
    const auth = await ensureAuthState(context.queryClient);
    if (auth.status === 'authenticated' && search.reauth !== '1') {
      throw redirect({ to: '/workspaces/' });
    }
  },
  component: LoginRoute,
  pendingComponent: AuthSplash,
});

function LoginRoute() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [resetOpen, setResetOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const { t } = useTranslate();

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

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await trpc.auth.wipeAndReset.mutate({ confirm: true });
      // app.relaunch() + app.exit(0) já foi chamado no main; UI não chega aqui
      // mas se chegar (relaunch desabilitado em dev), faz refresh manual
      window.location.reload();
    } catch (error) {
      setIsResetting(false);
      const message = error instanceof Error ? error.message : t('auth.reset.error');
      toast.error(t('auth.reset.error'), { description: message });
    }
  };

  return (
    <>
      <LoginPage
        controller={controller}
        mode={search.reauth === '1' ? 'reauth' : 'login'}
        {...(search.email ? { reauthEmail: search.email } : {})}
        onReset={() => setResetOpen(true)}
      />
      <ResetConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        onConfirm={handleReset}
        isResetting={isResetting}
      />
    </>
  );
}

function AuthSplash() {
  const { t } = useTranslate();
  return (
    <div className="flex min-h-screen items-center justify-center bg-foreground-2">
      <div className="flex flex-col items-center gap-4">
        <div className="size-10 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
        <p className="text-sm text-muted-foreground">{t('auth.splash.checking')}</p>
      </div>
    </div>
  );
}
