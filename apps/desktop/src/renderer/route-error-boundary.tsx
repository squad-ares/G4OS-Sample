/**
 * Default error boundary do TanStack Router. Sem isso, qualquer throw em
 * `beforeLoad` que NÃO seja `redirect()` pendura o app em
 * `defaultPendingComponent` (`Loading environment…`) sem caminho de
 * recovery — usuário fica travado.
 *
 * Mostra a mensagem original + dois botões pra recuperar:
 *   1. "Voltar para login" (limpa cache de auth e navega).
 *   2. "Tentar novamente" (router reset, re-tenta beforeLoad).
 */
import { useTranslate } from '@g4os/ui';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { setAuthUnauthenticated } from './auth/auth-store.ts';
import { queryClient } from './ipc/query-client.ts';

export interface RouteErrorBoundaryProps {
  readonly error: Error;
  readonly reset?: () => void;
}

export function RouteErrorBoundary({ error, reset }: RouteErrorBoundaryProps) {
  const { t } = useTranslate();
  const router = useRouter();
  const navigate = useNavigate();

  const message = error?.message ?? String(error);

  const handleRetry = (): void => {
    if (reset) reset();
    else void router.invalidate();
  };

  const handleBackToLogin = (): void => {
    setAuthUnauthenticated(queryClient);
    void navigate({ to: '/login', replace: true });
  };

  return (
    <div
      role="alert"
      className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-foreground-2 p-8 text-foreground"
    >
      <div className="titlebar-drag-region pointer-events-none fixed inset-x-0 top-0 z-10 h-10" />
      <div className="w-full max-w-md space-y-4 rounded-[24px] border border-foreground/10 bg-background/82 p-6 shadow-[0_18px_48px_rgba(0,31,53,0.08)]">
        <h1 className="text-lg font-semibold tracking-[-0.02em]">{t('shell.state.error.title')}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{message}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleRetry}
            className="flex-1 rounded-md border border-foreground/15 bg-background px-3 py-2 text-sm font-medium hover:bg-accent/12"
          >
            {t('shell.state.error.retry')}
          </button>
          <button
            type="button"
            onClick={handleBackToLogin}
            className="flex-1 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/92"
          >
            {t('shell.state.error.backToLogin')}
          </button>
        </div>
      </div>
    </div>
  );
}
