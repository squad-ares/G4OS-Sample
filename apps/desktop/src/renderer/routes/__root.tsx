import { Toaster, toast, useTranslate } from '@g4os/ui';
import { createRootRouteWithContext, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { invalidateAuth, setAuthUnauthenticated } from '../auth/auth-store.ts';
import { queryClient } from '../ipc/query-client.ts';
import { trpc } from '../ipc/trpc-client.ts';
import type { RouterContext } from '../router-context.ts';
import { useGlobalNewTurnShortcut } from '../shortcuts/use-global-new-turn.ts';

function NotFound() {
  const { t } = useTranslate();
  return (
    <div className="flex min-h-screen items-center justify-center px-4 text-center">
      <div className="rounded-[28px] border border-foreground/10 bg-background/82 px-8 py-10 shadow-[0_24px_80px_rgba(0,31,53,0.08)]">
        <h2 className="text-2xl font-semibold tracking-[-0.03em]">{t('routing.notFound.title')}</h2>
        <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {t('routing.notFound.description')}
        </p>
      </div>
    </div>
  );
}

/**
 * Subscriber global para `auth.managedLoginRequired`. Quando o backend pede
 * re-autenticação (token revogado, sessão expirada fora do flow normal de
 * OTP), invalida o cache de auth e mostra toast com action `Sign in`.
 *
 * Debounce simples evita toast duplicado se o backend emitir várias vezes.
 */
function ManagedLoginRequiredListener() {
  const { t } = useTranslate();
  const navigate = useNavigate();

  useEffect(() => {
    let lastShownAt = 0;
    const DEBOUNCE_MS = 1500;

    const sub = trpc.auth.managedLoginRequired.subscribe(undefined, {
      onData: () => {
        const now = Date.now();
        if (now - lastShownAt < DEBOUNCE_MS) return;
        lastShownAt = now;

        setAuthUnauthenticated(queryClient);
        void invalidateAuth(queryClient);

        toast.error(t('auth.required.toast.title'), {
          description: t('auth.required.toast.description'),
          action: {
            label: t('auth.required.toast.action'),
            onClick: () => {
              void navigate({ to: '/login', search: { reauth: '1' } });
            },
          },
        });
      },
      onError: () => {
        // subscription errors são silenciosas — o backend pode estar
        // reiniciando ou o canal cair durante shutdown
      },
    });

    return () => sub.unsubscribe();
  }, [t, navigate]);

  return null;
}

function RootLayout() {
  useGlobalNewTurnShortcut();
  return (
    <>
      <ManagedLoginRequiredListener />
      <Outlet />
      <Toaster position="top-right" richColors={true} closeButton={true} />
    </>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
});
