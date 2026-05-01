import { NewsPanel } from '@g4os/features/news';
import {
  SessionContextMenu,
  SessionLifecycleDialog,
  type SessionLifecycleDialogKind,
  type SessionListItem,
} from '@g4os/features/sessions';
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
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
  useTranslate,
} from '@g4os/ui';
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
import {
  matchActiveSessionId,
  matchPathSegment,
  renderSessionTagsContent,
  toMarketplacePanelItem,
  toSessionListItem,
} from '../_app-helpers.tsx';
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
  const [activeLabelFilter, setActiveLabelFilter] = useState<{
    readonly workspaceId: string;
    readonly labelId: string | null;
  }>({ workspaceId: '', labelId: null });
  const [sessionContextMenu, setSessionContextMenu] = useState<{
    readonly session: SessionListItem;
    readonly x: number;
    readonly y: number;
  } | null>(null);
  const [sessionLifecycleDialog, setSessionLifecycleDialog] = useState<{
    readonly kind: SessionLifecycleDialogKind;
    readonly session: SessionListItem;
  } | null>(null);
  const [renameDialog, setRenameDialog] = useState<{
    readonly id: string;
    readonly currentName: string;
  } | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const { data: workspaces = [] } = useQuery(workspacesListQueryOptions());
  const activeWorkspaceId = useActiveWorkspaceId();
  const setActiveWorkspaceId = useSetActiveWorkspaceId();
  const activeWorkspace =
    workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0] ?? null;
  const activeWorkspaceSlug = activeWorkspace?.id ?? '';
  const activeLabelId =
    activeLabelFilter.workspaceId === activeWorkspaceSlug ? activeLabelFilter.labelId : null;

  const sessionFilter = useMemo<SessionFilter>(
    () => ({
      workspaceId: activeWorkspaceSlug,
      lifecycle: sessionsTab === 'archived' ? 'archived' : 'active',
      pinned: sessionsTab === 'pinned' ? true : undefined,
      starred: sessionsTab === 'starred' ? true : undefined,
      unread: sessionsTab === 'unread' ? true : undefined,
      labelIds: activeLabelId ? [activeLabelId] : undefined,
      includeBranches: false,
      limit: 40,
      offset: 0,
    }),
    [activeLabelId, activeWorkspaceSlug, sessionsTab],
  );

  const sessionsListQuery = useQuery({
    ...sessionsListQueryOptions(sessionFilter),
    enabled: activeWorkspaceSlug.length > 0,
  });

  // Auto-onboarding: workspace recém-criado (setupCompleted=false + 0 sessions)
  // dispara session "Workspace Setup" com prompt guiado. Equivalente a V1
  // Equivalente ao auto-trigger V1 — sem skill bundled ainda.
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

  const labelsQuery = useQuery({
    queryKey: ['labels', 'list', activeWorkspaceSlug],
    queryFn: () => trpc.labels.list.query({ workspaceId: activeWorkspaceSlug }),
    staleTime: 30_000,
    enabled: activeWorkspaceSlug.length > 0,
  });

  const labelNameById = useMemo(() => {
    const labels = labelsQuery.data ?? [];
    return new Map(labels.map((label) => [label.id, label.name]));
  }, [labelsQuery.data]);

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
      if (to === '/workspaces' && activeWorkspaceSlug) {
        void navigate({
          to: '/workspaces/$workspaceId/sessions',
          params: { workspaceId: activeWorkspaceSlug },
        });
        return;
      }
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
      // CR-UX: aplica filtros ativos (star/pin/unread/label) à sessão recém
      // criada pra ela aparecer na aba que está aberta. Sem isso, criar
      // sessão na aba "starred" cai na aba "recent" e o usuário pensa que
      // o create falhou. Cada mutation é best-effort — falha não invalida
      // a navegação para a sessão nova.
      const followups: Promise<unknown>[] = [];
      if (sessionsTab === 'starred') {
        followups.push(trpc.sessions.star.mutate({ id: session.id, starred: true }));
      }
      if (sessionsTab === 'pinned') {
        followups.push(trpc.sessions.pin.mutate({ id: session.id, pinned: true }));
      }
      // unread: criação padrão já não fica unread; aba "unread" mostra
      // sessões com novas mensagens não lidas — não faz sentido pré-marcar.
      if (followups.length > 0) {
        await Promise.allSettled(followups);
      }
      await invalidateSessions(queryClient);
      await navigate({
        to: '/workspaces/$workspaceId/sessions/$sessionId',
        params: { workspaceId: activeWorkspaceSlug, sessionId: session.id },
      });
    } catch {
      // errors handled via toast in sessions flow; fallback to no-op here
    }
  };

  const refreshSessionData = useCallback(async (sessionId?: string) => {
    await invalidateSessions(queryClient);
    if (sessionId) {
      await queryClient.invalidateQueries({ queryKey: ['sessions', 'get', sessionId] });
    }
  }, []);

  const findPanelSession = useCallback(
    (id: string): SessionListItem | null => {
      const session = sessionsListQuery.data?.items.find((item) => item.id === id);
      return session ? toSessionListItem(session) : null;
    },
    [sessionsListQuery.data?.items],
  );

  const handleRenameSession = useCallback(
    (id: string): void => {
      const currentName = findPanelSession(id)?.name ?? sessionContextMenu?.session.name ?? '';
      setRenameInput(currentName);
      setRenameDialog({ id, currentName });
    },
    [findPanelSession, sessionContextMenu?.session.name],
  );

  const handleRenameConfirm = useCallback(async (): Promise<void> => {
    if (!renameDialog) return;
    const trimmed = renameInput.trim();
    if (!trimmed || trimmed === renameDialog.currentName) {
      setRenameDialog(null);
      return;
    }
    try {
      await trpc.sessions.update.mutate({ id: renameDialog.id, patch: { name: trimmed } });
      await refreshSessionData(renameDialog.id);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setRenameDialog(null);
    }
  }, [refreshSessionData, renameDialog, renameInput]);

  const handlePinSession = useCallback(
    async (id: string, pinned: boolean): Promise<void> => {
      try {
        await trpc.sessions.pin.mutate({ id, pinned });
        await refreshSessionData(id);
      } catch (err) {
        toast.error(String(err));
      }
    },
    [refreshSessionData],
  );

  const handleStarSession = useCallback(
    async (id: string, starred: boolean): Promise<void> => {
      try {
        await trpc.sessions.star.mutate({ id, starred });
        await refreshSessionData(id);
      } catch (err) {
        toast.error(String(err));
      }
    },
    [refreshSessionData],
  );

  const handleMarkSessionRead = useCallback(
    async (id: string, unread: boolean): Promise<void> => {
      try {
        await trpc.sessions.markRead.mutate({ id, unread });
        await refreshSessionData(id);
      } catch (err) {
        toast.error(String(err));
      }
    },
    [refreshSessionData],
  );

  const handleSessionLifecycleConfirm = useCallback(async (): Promise<void> => {
    if (!sessionLifecycleDialog) return;
    const { kind, session } = sessionLifecycleDialog;
    try {
      if (kind === 'archive') await trpc.sessions.archive.mutate({ id: session.id });
      else if (kind === 'restore') await trpc.sessions.restore.mutate({ id: session.id });
      else await trpc.sessions.delete.mutate({ id: session.id, confirm: true });
      setSessionLifecycleDialog(null);
      await refreshSessionData(session.id);
    } catch (err) {
      toast.error(String(err));
    }
  }, [refreshSessionData, sessionLifecycleDialog]);

  const renderSessionsPanel = (footer: React.ReactNode) => {
    const activeSessionId = matchActiveSessionId(location.pathname);
    const items = (sessionsListQuery.data?.items ?? []).map((s) => {
      const item = mapSessionToPanelItem(s, activeSessionId);
      return {
        ...item,
        labels: s.labels.map((id) => labelNameById.get(id) ?? id),
      };
    });
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
        onSessionContextMenu={(event, item) => {
          event.preventDefault();
          const session = findPanelSession(item.id);
          if (!session) return;
          setSessionContextMenu({ session, x: event.clientX, y: event.clientY });
        }}
        loading={sessionsListQuery.isLoading}
        tagsContent={renderSessionTagsContent({
          activeLabelId,
          labels: labelsQuery.data ?? [],
          loading: labelsQuery.isLoading,
          t,
          onSelect: (labelId) => {
            setSessionsTab('recent');
            setActiveLabelFilter({ workspaceId: activeWorkspaceSlug, labelId });
          },
          onClear: () => setActiveLabelFilter({ workspaceId: activeWorkspaceSlug, labelId: null }),
        })}
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
        // CR-UX: só passa onNewSession quando há workspace ativo. Sem isso o
        // botão fica visível (na sidebar e no panel) mas o handler `return`
        // silenciosamente — clique não faz nada, confunde o usuário. AppShell
        // / WorkspaceSidebar / SessionsPanel checam pelo prop ser opcional e
        // escondem a UI de criar nova sessão quando não recebem o callback.
        {...(activeWorkspaceSlug ? { onNewSession: () => void handleNewSession() } : {})}
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
      {sessionContextMenu ? (
        <SessionContextMenu
          open={true}
          position={{ x: sessionContextMenu.x, y: sessionContextMenu.y }}
          session={sessionContextMenu.session}
          onClose={() => setSessionContextMenu(null)}
          onPin={(id, pinned) => void handlePinSession(id, pinned)}
          onStar={(id, starred) => void handleStarSession(id, starred)}
          onMarkRead={(id, unread) => void handleMarkSessionRead(id, unread)}
          onRename={(id) => handleRenameSession(id)}
          onArchive={(id) => {
            const session = findPanelSession(id) ?? sessionContextMenu.session;
            setSessionLifecycleDialog({ kind: 'archive', session });
          }}
          onRestore={(id) => {
            const session = findPanelSession(id) ?? sessionContextMenu.session;
            setSessionLifecycleDialog({ kind: 'restore', session });
          }}
          onDelete={(id) => {
            const session = findPanelSession(id) ?? sessionContextMenu.session;
            setSessionLifecycleDialog({ kind: 'delete', session });
          }}
        />
      ) : null}
      {sessionLifecycleDialog ? (
        <SessionLifecycleDialog
          open={true}
          kind={sessionLifecycleDialog.kind}
          sessionName={sessionLifecycleDialog.session.name}
          onConfirm={() => void handleSessionLifecycleConfirm()}
          onCancel={() => setSessionLifecycleDialog(null)}
        />
      ) : null}
      <Dialog
        open={renameDialog !== null}
        onOpenChange={(open) => {
          if (!open) setRenameDialog(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('session.rename.prompt')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleRenameConfirm();
            }}
            className="flex flex-col gap-4"
          >
            <Input
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              placeholder={t('session.rename.placeholder')}
              autoFocus={true}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRenameDialog(null)}>
                {t('session.dialog.cancel')}
              </Button>
              <Button type="submit" disabled={!renameInput.trim()}>
                {t('session.action.rename')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
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
              void navigate({ to: '/workspaces' });
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
