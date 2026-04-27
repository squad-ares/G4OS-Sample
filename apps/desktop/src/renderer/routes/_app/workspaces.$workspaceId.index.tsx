import {
  useSetActiveWorkspaceId,
  WorkspaceLandingCanvas,
  type WorkspaceLandingChip,
} from '@g4os/features/workspaces';
import type { Session, SessionFilter } from '@g4os/kernel/types';
import { toast, useTranslate } from '@g4os/ui';
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
  const sourcesQuery = useQuery({
    queryKey: ['sources', 'list', workspaceId],
    queryFn: () => trpc.sources.list.query({ workspaceId }),
    staleTime: 30_000,
    enabled: workspaceId.length > 0,
  });

  const recentItems = recentSessionsQuery.data?.items ?? [];
  const mostRecentSession = recentItems[0];
  const projectCount = projectsQuery.data?.length ?? 0;
  const recentCount = recentItems.length;
  const sourceCount = sourcesQuery.data?.filter((s) => s.enabled).length ?? 0;

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

  const chips: ReadonlyArray<WorkspaceLandingChip> = [
    { label: t('workspace.landing.stats.projects'), value: projectCount },
    { label: t('workspace.landing.stats.recent'), value: recentCount },
    { label: t('workspace.landing.stats.sources'), value: sourceCount },
  ];

  return (
    <WorkspaceLandingCanvas
      eyebrow={t('workspace.landing.eyebrow')}
      title={t('workspace.landing.title')}
      description={t('workspace.landing.description')}
      brandMark={t('app.mark')}
      primaryActionLabel={t('workspace.landing.cta.newSession')}
      onPrimaryAction={handleNewSession}
      primaryActionDisabled={createSessionMutation.isPending}
      {...(mostRecentSession
        ? {
            recentActionLabel: t('workspace.landing.cta.recentSession', {
              name: mostRecentSession.name,
            }),
            onRecentAction: handleOpenRecent,
            recentChipLabel: mostRecentSession.name,
          }
        : {})}
      readyTitle={t('workspace.landing.ready.title')}
      readyDescription={t('workspace.landing.ready.description')}
      chips={chips}
      activeLabel={t('workspace.landing.active.label')}
      workspaceName={workspace?.name ?? ''}
      recentLine={
        mostRecentSession
          ? t('workspace.landing.active.recent', { name: mostRecentSession.name })
          : t('workspace.landing.active.empty')
      }
    />
  );
}

export const Route = createFileRoute('/_app/workspaces/$workspaceId/')({
  component: WorkspaceLandingPage,
});
