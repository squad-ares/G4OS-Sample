import {
  AppShell,
  resolveShellNavigation,
  ShellCommandPalette,
  ShellShortcutsDialog,
  shellActionDefinitions,
  useGlobalShortcuts,
} from '@g4os/features/shell';
import {
  useActiveWorkspaceId,
  useSetActiveWorkspaceId,
  useWorkspaceShortcuts,
  WorkspaceSwitcherContent,
} from '@g4os/features/workspaces';
import { Dialog, DialogContent, DialogHeader, DialogTitle, useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from '@tanstack/react-router';
import { startTransition, useMemo, useState } from 'react';
import { ensureAuthState, setAuthUnauthenticated } from '../auth/auth-store.ts';
import { queryClient } from '../ipc/query-client.ts';
import { trpc } from '../ipc/trpc-client.ts';
import { workspacesListQueryOptions } from '../workspaces/workspaces-store.ts';

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
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const activeEntry = resolveShellNavigation(location.pathname);

  const { data: workspaces = [] } = useQuery(workspacesListQueryOptions());
  const activeWorkspaceId = useActiveWorkspaceId();
  const setActiveWorkspaceId = useSetActiveWorkspaceId();
  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;

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

  const shortcutBindings = useMemo(
    () =>
      workspaces.slice(0, 9).map((workspace, index) => ({
        index: index + 1,
        workspaceId: workspace.id,
        onActivate: (id: string) => {
          setActiveWorkspaceId(id);
        },
      })),
    [workspaces, setActiveWorkspaceId],
  );

  useWorkspaceShortcuts(shortcutBindings);

  const headerTitle = activeEntry ? t(activeEntry.labelKey) : t('app.name');
  const headerDescription = activeEntry
    ? t(activeEntry.descriptionKey)
    : t('shell.header.fallbackDescription');

  return (
    <>
      <AppShell
        navigation={{ activePath: location.pathname, onNavigate: handleNavigate }}
        workspace={{
          name: activeWorkspace?.name ?? t('app.name'),
          onOpenSwitcher: () => setSwitcherOpen(true),
        }}
        onOpenSupport={() => handleNavigate('/support')}
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
      <Dialog open={switcherOpen} onOpenChange={setSwitcherOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('workspace.switcher.ariaLabel')}</DialogTitle>
          </DialogHeader>
          <WorkspaceSwitcherContent
            workspaces={workspaces}
            activeWorkspaceId={activeWorkspaceId}
            onSelect={(id) => {
              setActiveWorkspaceId(id);
              setSwitcherOpen(false);
            }}
            onCreateNew={() => {
              setSwitcherOpen(false);
              handleNavigate('/workspaces/new');
            }}
            onManage={() => {
              setSwitcherOpen(false);
              handleNavigate('/workspaces');
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
