import { useSetActiveWorkspaceId } from '@g4os/features/workspaces';
import type { Session, SessionFilter } from '@g4os/kernel/types';
import { Button, toast, useTranslate } from '@g4os/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo } from 'react';
import { queryClient } from '../../ipc/query-client.ts';
import { trpc } from '../../ipc/trpc-client.ts';
import { projectsListQueryOptions } from '../../projects/projects-store.ts';
import { invalidateSessions, sessionsListQueryOptions } from '../../sessions/sessions-store.ts';
import { workspacesListQueryOptions } from '../../workspaces/workspaces-store.ts';

const RECENT_LIMIT = 5;

function WorkspaceLandingPage() {
  const { t } = useTranslate();
  const navigate = useNavigate();
  const { workspaceId } = Route.useParams();
  const setActiveWorkspaceId = useSetActiveWorkspaceId();

  useEffect(() => {
    setActiveWorkspaceId(workspaceId);
  }, [workspaceId, setActiveWorkspaceId]);

  const workspacesQuery = useQuery(workspacesListQueryOptions());
  const workspace = workspacesQuery.data?.find((w) => w.id === workspaceId);

  const sessionFilter = useMemo<SessionFilter>(
    () => ({
      workspaceId,
      lifecycle: 'active',
      includeBranches: false,
      limit: RECENT_LIMIT,
      offset: 0,
    }),
    [workspaceId],
  );

  const recentSessionsQuery = useQuery(sessionsListQueryOptions(sessionFilter));
  const projectsQuery = useQuery(projectsListQueryOptions(workspaceId));

  const recentItems = recentSessionsQuery.data?.items ?? [];
  const mostRecentSession = recentItems[0];
  const projectCount = projectsQuery.data?.length ?? 0;
  const recentCount = recentItems.length;

  const createSessionMutation = useMutation({
    mutationFn: () =>
      trpc.sessions.create.mutate({
        workspaceId,
        name: t('session.new.defaultName'),
      }),
    onSuccess: async (created: Session) => {
      await invalidateSessions(queryClient);
      await navigate({
        to: '/workspaces/$workspaceId/sessions/$sessionId',
        params: { workspaceId, sessionId: created.id },
      });
    },
    onError: (err) => toast.error(String(err)),
  });

  const handleNewSession = (): void => {
    createSessionMutation.mutate();
  };

  const handleOpenRecent = (): void => {
    if (!mostRecentSession) return;
    void navigate({
      to: '/workspaces/$workspaceId/sessions/$sessionId',
      params: { workspaceId, sessionId: mostRecentSession.id },
    });
  };

  const handleOpenProjects = (): void => {
    void navigate({ to: '/projects' });
  };

  return (
    <div className="flex h-full flex-col gap-6 px-6 py-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('workspace.landing.eyebrow')}
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{t('workspace.landing.title')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {t('workspace.landing.description')}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={handleNewSession} disabled={createSessionMutation.isPending}>
          {t('workspace.landing.cta.newSession')}
        </Button>
        {mostRecentSession && (
          <Button variant="outline" onClick={handleOpenRecent}>
            {t('workspace.landing.cta.recentSession', { name: mostRecentSession.name })}
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ReadyPanel
          projectCount={projectCount}
          recentCount={recentCount}
          onProjects={handleOpenProjects}
        />
        <ActiveWorkspacePanel
          workspaceName={workspace?.name ?? ''}
          {...(mostRecentSession ? { recentSessionName: mostRecentSession.name } : {})}
        />
      </div>
    </div>
  );
}

interface ReadyPanelProps {
  readonly projectCount: number;
  readonly recentCount: number;
  readonly onProjects: () => void;
}

function ReadyPanel({ projectCount, recentCount, onProjects }: ReadyPanelProps) {
  const { t } = useTranslate();
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">{t('workspace.landing.ready.title')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('workspace.landing.ready.description')}
      </p>
      <div className="mt-4 flex gap-6">
        <button
          type="button"
          onClick={onProjects}
          className="flex flex-col text-left transition-opacity hover:opacity-80"
        >
          <span className="text-2xl font-semibold">{projectCount}</span>
          <span className="text-xs text-muted-foreground">
            {t('workspace.landing.stats.projects')}
          </span>
        </button>
        <div className="flex flex-col">
          <span className="text-2xl font-semibold">{recentCount}</span>
          <span className="text-xs text-muted-foreground">
            {t('workspace.landing.stats.recent')}
          </span>
        </div>
      </div>
    </section>
  );
}

interface ActiveWorkspacePanelProps {
  readonly workspaceName: string;
  readonly recentSessionName?: string;
}

function ActiveWorkspacePanel({ workspaceName, recentSessionName }: ActiveWorkspacePanelProps) {
  const { t } = useTranslate();
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-base font-semibold">{t('workspace.landing.active.title')}</h2>
      <p className="mt-1 text-sm">{workspaceName}</p>
      {recentSessionName && (
        <p className="mt-2 text-xs text-muted-foreground">
          {t('workspace.landing.active.recent', { name: recentSessionName })}
        </p>
      )}
    </section>
  );
}

export const Route = createFileRoute('/_app/workspaces/$workspaceId/')({
  component: WorkspaceLandingPage,
});
