import { Toaster, useTranslate } from '@g4os/ui';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import type { RouterContext } from '../router-context.ts';

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

function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster position="top-right" richColors={true} closeButton={true} />
    </>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFound,
});
