import {
  AppShell,
  resolveShellNavigation,
  ShellCommandPalette,
  ShellShortcutsDialog,
  shellActionDefinitions,
  useGlobalShortcuts,
} from '@g4os/features/shell';
import { useTranslate } from '@g4os/ui';
import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from '@tanstack/react-router';
import { startTransition, useState } from 'react';
import { ensureAuthState, setAuthUnauthenticated } from '../auth/auth-store.ts';
import { queryClient } from '../ipc/query-client.ts';
import { trpc } from '../ipc/trpc-client.ts';

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    const auth = await ensureAuthState(context.queryClient);
    if (auth.status !== 'authenticated') {
      throw redirect({ to: '/login' });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { t } = useTranslate();
  const navigate = useNavigate();
  const location = useLocation();
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const activeEntry = resolveShellNavigation(location.pathname);

  const handleSignOut = async () => {
    try {
      await trpc.auth.signOut.mutate();
    } finally {
      setAuthUnauthenticated(queryClient);
      await navigate({ to: '/login' });
    }
  };

  const handleNavigate = (to: string) => {
    startTransition(() => {
      void navigate({ to: to as never });
    });
  };

  useGlobalShortcuts(
    shellActionDefinitions.map((definition) => ({
      definition,
      run: () => {
        if (definition.intent.kind === 'dialog') {
          if (definition.intent.target === 'command-palette') {
            startTransition(() => {
              setCommandOpen(true);
            });
            return;
          }

          startTransition(() => {
            setShortcutsOpen(true);
          });
          return;
        }

        if (definition.intent.kind === 'navigate') {
          handleNavigate(definition.intent.to);
          return;
        }

        void handleSignOut();
      },
    })),
  );

  const headerTitle = activeEntry ? t(activeEntry.labelKey) : t('app.name');
  const headerDescription = activeEntry
    ? t(activeEntry.descriptionKey)
    : t('shell.header.fallbackDescription');

  return (
    <>
      <AppShell
        sidebar={{ workspaces: [] }}
        navigation={{ activePath: location.pathname, onNavigate: handleNavigate }}
        header={{
          title: headerTitle,
          description: headerDescription,
          onSignOut: () => void handleSignOut(),
          onOpenCommandPalette: () => {
            startTransition(() => {
              setCommandOpen(true);
            });
          },
          onOpenShortcuts: () => {
            startTransition(() => {
              setShortcutsOpen(true);
            });
          },
        }}
      >
        <Outlet />
      </AppShell>
      <ShellCommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onNavigate={handleNavigate}
        onOpenShortcuts={() => {
          startTransition(() => {
            setShortcutsOpen(true);
          });
        }}
        onSignOut={() => void handleSignOut()}
      />
      <ShellShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </>
  );
}
