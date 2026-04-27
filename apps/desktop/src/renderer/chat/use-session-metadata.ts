import {
  buildRuntimePendingBanner,
  type SessionBanner,
  type SessionMetadataProject,
} from '@g4os/features/chat';
import type { Project, Session } from '@g4os/kernel/types';
import { toast, useTranslate } from '@g4os/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { trpc } from '../ipc/trpc-client.ts';

interface UseSessionMetadataArgs {
  readonly sessionId: string;
  readonly sessionQuery: UseQueryResult<Session>;
  readonly projects: ReadonlyArray<Project> | undefined;
  readonly agentAvailable: boolean;
  readonly navigate: ReturnType<typeof useNavigate>;
}

interface UseSessionMetadataResult {
  readonly linkedProject: SessionMetadataProject | null;
  readonly availableProjects: ReadonlyArray<SessionMetadataProject>;
  readonly handleSelectProject: (projectId: string | null) => Promise<void>;
  readonly sessionBanners: ReadonlyArray<SessionBanner>;
}

/**
 * Hook que monta os derivados de metadata da sessão (linked project,
 * available projects para o picker, banners ativos). Extraído pra
 * manter o route file abaixo do cap 500 LOC.
 */
export function useSessionMetadata({
  sessionId,
  sessionQuery,
  projects,
  agentAvailable,
  navigate,
}: UseSessionMetadataArgs): UseSessionMetadataResult {
  const { t } = useTranslate();
  const linkedProject = useMemo<SessionMetadataProject | null>(() => {
    const linkedId = sessionQuery.data?.projectId;
    if (!linkedId) return null;
    const project = projects?.find((p) => p.id === linkedId);
    if (!project) return null;
    const out: SessionMetadataProject = { id: project.id, name: project.name };
    if (project.color) (out as { color?: string }).color = project.color;
    return out;
  }, [sessionQuery.data?.projectId, projects]);

  const availableProjects = useMemo<ReadonlyArray<SessionMetadataProject>>(() => {
    return (projects ?? []).map((p) => {
      const m: SessionMetadataProject = { id: p.id, name: p.name };
      if (p.color) (m as { color?: string }).color = p.color;
      return m;
    });
  }, [projects]);

  const handleSelectProject = useCallback(
    async (projectId: string | null): Promise<void> => {
      try {
        await trpc.sessions.update.mutate({
          id: sessionId,
          patch: { projectId: projectId ?? undefined },
        });
        await sessionQuery.refetch();
      } catch (err) {
        toast.error(String(err));
      }
    },
    [sessionId, sessionQuery],
  );

  const sessionBanners = useMemo<ReadonlyArray<SessionBanner>>(() => {
    const list: SessionBanner[] = [];
    if (!agentAvailable) {
      list.push(
        buildRuntimePendingBanner(t('chat.runtime.pendingNotice'), {
          label: t('chat.runtime.configureCTA'),
          onClick: () =>
            void navigate({ to: '/settings/$category', params: { category: 'api-keys' } }),
        }),
      );
    }
    return list;
  }, [agentAvailable, navigate, t]);

  return {
    linkedProject,
    availableProjects,
    handleSelectProject,
    sessionBanners,
  };
}
