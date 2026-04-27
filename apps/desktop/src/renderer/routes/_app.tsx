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
  AutomationsPanel,
  type ContextualSubSidebarProps,
  MarketplacePanel,
  type MarketplacePanelItem,
  mapSessionToPanelItem,
  ProjectsPanel,
  SessionsPanel,
  type SessionsSubTab,
  type ShellActionDefinition,
  ShellCommandPalette,
  ShellShortcutsDialog,
  SourcesPanel,
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
import { useFirstLoginSetup } from '../onboarding/use-first-login-setup.ts';
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

  // Auto-onboarding: workspace recém-criado (setupCompleted=false + 0 sessions)
  // dispara session "Workspace Setup" com prompt guiado. Equivalente a V1
  // App.tsx:1431-1450. Sem skill bundled ainda (TASK-CR1-18 fará).
  useFirstLoginSetup({
    activeWorkspaceId: activeWorkspaceSlug.length > 0 ? activeWorkspaceSlug : null,
    hasSessions: (sessionsListQuery.data?.items.length ?? 0) > 0,
    onSessionCreated: (sessionId, workspaceId) => {
      void invalidateSessions(queryClient).then(() =>
        navigate({
          to: '/workspaces/$workspaceId/sessions/$sessionId',
          params: { workspaceId, sessionId },
        }),
      );
    },
  });

  const projectsQuery = useQuery({
    ...projectsListQueryOptions(activeWorkspaceSlug),
    enabled: activeWorkspaceSlug.length > 0,
  });

  const sourcesQuery = useQuery({
    queryKey: ['sources', 'list', activeWorkspaceSlug],
    queryFn: () => trpc.sources.list.query({ workspaceId: activeWorkspaceSlug }),
    staleTime: 30_000,
    enabled: activeWorkspaceSlug.length > 0,
  });

  const marketplaceQuery = useQuery({
    queryKey: ['marketplace', 'list'],
    queryFn: () => trpc.marketplace.list.query(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
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

  const runDialogIntent = (target: 'command-palette' | 'shortcuts'): void => {
    startTransition(() => {
      if (target === 'command-palette') setCommandOpen(true);
      else setShortcutsOpen(true);
    });
  };

  const runSessionIntent = (target: 'sign-out' | 'new-session'): void => {
    if (target === 'new-session') void handleNewSession();
    else void handleSignOut();
  };

  const runShellIntent = (intent: ShellActionDefinition['intent']): void => {
    if (intent.kind === 'dialog') runDialogIntent(intent.target);
    else if (intent.kind === 'navigate') handleNavigate(intent.to);
    else runSessionIntent(intent.target);
  };

  useGlobalShortcuts(
    shellActionDefinitions.map((definition) => ({
      definition,
      run: () => runShellIntent(definition.intent),
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

  const renderSessionsPanel = (footer: React.ReactNode) => {
    const items = (sessionsListQuery.data?.items ?? []).map((s) => mapSessionToPanelItem(s));
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
  };

  const renderProjectsPanel = (footer: React.ReactNode) => (
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

  const renderConnectionsPanel = (footer: React.ReactNode) => (
    <SourcesPanel
      sources={sourcesQuery.data ?? []}
      loading={sourcesQuery.isLoading}
      onOpenSource={() => void navigate({ to: '/connections' })}
      onManage={() => void navigate({ to: '/connections' })}
      footer={footer}
    />
  );

  const renderMarketplacePanel = (footer: React.ReactNode) => {
    const items: ReadonlyArray<MarketplacePanelItem> = (marketplaceQuery.data ?? []).map(
      toMarketplacePanelItem,
    );
    return (
      <MarketplacePanel
        items={items}
        loading={marketplaceQuery.isLoading}
        onOpenItem={() => void navigate({ to: '/marketplace' })}
        onBrowse={() => void navigate({ to: '/marketplace' })}
        footer={footer}
      />
    );
  };

  const renderAutomationsPanel = (footer: React.ReactNode) => (
    <AutomationsPanel
      items={[]}
      onOpenItem={() => void navigate({ to: '/automations' })}
      onNewAutomation={() => void navigate({ to: '/automations' })}
      footer={footer}
    />
  );

  const renderSubSidebarPanel: ContextualSubSidebarProps['renderPanel'] = ({
    featureId,
    footer,
  }) => {
    switch (featureId) {
      case 'sessions':
        return renderSessionsPanel(footer);
      case 'projects':
        return renderProjectsPanel(footer);
      case 'connections':
        return renderConnectionsPanel(footer);
      case 'marketplace':
        return renderMarketplacePanel(footer);
      case 'automations':
        return renderAutomationsPanel(footer);
      case 'news':
        return renderNewsPanel(footer);
      case 'settings':
        return renderSettingsPanel(footer);
      default:
        return null;
    }
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

/**
 * Adapter best-effort: marketplace router atual retorna `z.array(z.unknown())`,
 * sem schema firme. Tentamos extrair os campos quando o item for um objeto;
 * se não casar, devolve um placeholder não-clicável que o panel renderiza
 * só com o nome.
 */
function toMarketplacePanelItem(raw: unknown): MarketplacePanelItem {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    const id = pickString(r['id']) ?? pickString(r['slug']) ?? 'unknown';
    const name = pickString(r['name']) ?? pickString(r['displayName']) ?? id;
    const item: MarketplacePanelItem = { id, name };
    const category = pickString(r['category']);
    if (category) (item as { category?: string }).category = category;
    const description = pickString(r['description']);
    if (description) (item as { description?: string }).description = description;
    const creatorDisplayName = pickString(r['creatorDisplayName']);
    if (creatorDisplayName)
      (item as { creatorDisplayName?: string }).creatorDisplayName = creatorDisplayName;
    if (typeof r['installed'] === 'boolean')
      (item as { installed?: boolean }).installed = r['installed'];
    return item;
  }
  return { id: 'unknown', name: '—' };
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
