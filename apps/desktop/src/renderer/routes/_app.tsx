import { NewsPanel } from '@g4os/features/news';
import {
  findSettingsCategory,
  isSettingsCategoryId,
  SETTINGS_CATEGORIES,
  type SettingsCategoryId,
  SettingsPanel,
} from '@g4os/features/settings';
import {
  AppShell,
  type ContextualSubSidebarProps,
  mapSessionToPanelItem,
  ProjectsPanel,
  SessionsPanel,
  type SessionsSubTab,
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
import type { SessionFilter } from '@g4os/kernel/types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from '@tanstack/react-router';
import type React from 'react';
import { startTransition, useCallback, useMemo, useState } from 'react';
import { ensureAuthState, setAuthUnauthenticated } from '../auth/auth-store.ts';
import { queryClient } from '../ipc/query-client.ts';
import { trpc } from '../ipc/trpc-client.ts';
import { useSeenNewsIds } from '../news/seen-store.ts';
import { projectsListQueryOptions } from '../projects/projects-store.ts';
import { invalidateSessions, sessionsListQueryOptions } from '../sessions/sessions-store.ts';
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
  const [sessionsTab, setSessionsTab] = useState<SessionsSubTab>('recent');
  const { data: workspaces = [] } = useQuery(workspacesListQueryOptions());
  const activeWorkspaceId = useActiveWorkspaceId();
  const setActiveWorkspaceId = useSetActiveWorkspaceId();
  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;
  const activeWorkspaceSlug = activeWorkspace?.id ?? '';

  const sessionFilter = useMemo<SessionFilter>(
    () => ({
      workspaceId: activeWorkspaceSlug,
      lifecycle: sessionsTab === 'archived' ? 'archived' : 'active',
      starred: sessionsTab === 'starred' ? true : undefined,
      includeBranches: false,
      limit: 40,
      offset: 0,
    }),
    [activeWorkspaceSlug, sessionsTab],
  );

  const sessionsListQuery = useQuery({
    ...sessionsListQueryOptions(sessionFilter),
    enabled: activeWorkspaceSlug.length > 0,
  });

  const projectsQuery = useQuery({
    ...projectsListQueryOptions(activeWorkspaceSlug),
    enabled: activeWorkspaceSlug.length > 0,
  });

  const newsQuery = useQuery({
    queryKey: ['news', 'list'],
    queryFn: () => trpc.news.list.query(),
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
  });
  const seenNewsIds = useSeenNewsIds();
  const refreshNews = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['news'] });
  }, []);

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

  const handleNewSession = async () => {
    if (!activeWorkspaceSlug) return;
    try {
      const session = await trpc.sessions.create.mutate({
        workspaceId: activeWorkspaceSlug,
        name: t('session.new.defaultName'),
      });
      await invalidateSessions(queryClient);
      await navigate({
        to: '/workspaces/$workspaceId/sessions/$sessionId',
        params: { workspaceId: activeWorkspaceSlug, sessionId: session.id },
      });
    } catch {
      // errors handled via toast in sessions flow; fallback to no-op here
    }
  };

  const renderSubSidebarPanel: ContextualSubSidebarProps['renderPanel'] = ({
    featureId,
    footer,
  }) => {
    if (featureId === 'sessions') {
      const items = (sessionsListQuery.data?.items ?? []).map((session) =>
        mapSessionToPanelItem(session),
      );
      return (
        <SessionsPanel
          sessions={items}
          activeTab={sessionsTab}
          onTabChange={setSessionsTab}
          onOpenSession={(sessionId) => {
            if (!activeWorkspaceSlug) return;
            void navigate({
              to: '/workspaces/$workspaceId/sessions/$sessionId',
              params: { workspaceId: activeWorkspaceSlug, sessionId },
            });
          }}
          onNewSession={() => void handleNewSession()}
          loading={sessionsListQuery.isLoading}
          footer={footer}
        />
      );
    }

    if (featureId === 'projects') {
      return (
        <ProjectsPanel
          projects={projectsQuery.data ?? []}
          loading={projectsQuery.isLoading}
          onOpenProject={(projectId) =>
            void navigate({ to: '/projects/$projectId', params: { projectId } })
          }
          onNewProject={() => void navigate({ to: '/projects' })}
          footer={footer}
        />
      );
    }

    if (featureId === 'news') return renderNewsPanel(footer);
    if (featureId === 'settings') return renderSettingsPanel(footer);
    return null;
  };

  const renderNewsPanel = (footer: React.ReactNode) => {
    const selectedId = matchPathSegment(location.pathname, 'news');
    return (
      <NewsPanel
        items={newsQuery.data ?? []}
        {...(selectedId ? { selectedId } : {})}
        seenIds={seenNewsIds}
        onSelect={(id) => void navigate({ to: '/news/$newsId', params: { newsId: id } })}
        onRefresh={refreshNews}
        isRefreshing={newsQuery.isFetching}
        footer={footer}
      />
    );
  };

  const renderSettingsPanel = (footer: React.ReactNode) => {
    const slug = matchPathSegment(location.pathname, 'settings');
    const activeId =
      slug && isSettingsCategoryId(slug) ? (findSettingsCategory(slug)?.id ?? null) : null;
    return (
      <SettingsPanel
        categories={SETTINGS_CATEGORIES}
        activeId={activeId}
        onSelect={(id: SettingsCategoryId) =>
          void navigate({ to: '/settings/$category', params: { category: id } })
        }
        footer={footer}
      />
    );
  };

  return (
    <>
      <AppShell
        navigation={{ activePath: location.pathname, onNavigate: handleNavigate }}
        workspace={{
          name: activeWorkspace?.name ?? t('app.name'),
          ...(activeWorkspace?.metadata?.theme ? { color: activeWorkspace.metadata.theme } : {}),
          onOpenSwitcher: () => setSwitcherOpen(true),
        }}
        onOpenCommandPalette={() => {
          startTransition(() => {
            setCommandOpen(true);
          });
        }}
        onOpenShortcuts={() => {
          startTransition(() => {
            setShortcutsOpen(true);
          });
        }}
        onSignOut={() => void handleSignOut()}
        renderSubSidebarPanel={renderSubSidebarPanel}
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

function matchPathSegment(pathname: string, root: string): string | undefined {
  const re = new RegExp(`^/${root}/([^/]+)`);
  const match = pathname.match(re);
  return match?.[1];
}
