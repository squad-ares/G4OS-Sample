import { findModel } from '@g4os/features/chat';
import type { Session } from '@g4os/kernel/types';
import { toast } from '@g4os/ui';
import type { UseQueryResult } from '@tanstack/react-query';
import type { useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { trpc } from '../ipc/trpc-client.ts';

interface UseSessionHeaderArgs {
  readonly sessionId: string;
  readonly workspaceId: string;
  readonly currentModelId: string;
  readonly sessionQuery: UseQueryResult<Session>;
  readonly navigate: ReturnType<typeof useNavigate>;
}

interface UseSessionHeaderResult {
  readonly modelLabel: string;
  readonly providerLabel?: string;
  readonly handleRename: (next: string) => Promise<void>;
  readonly handleArchive: () => Promise<void>;
}

/**
 * Hook que monta callbacks + labels usados pelo `SessionHeader` na página de
 * sessão. Extraído pra manter o route file abaixo do cap 500 LOC.
 */
export function useSessionHeader({
  sessionId,
  workspaceId,
  currentModelId,
  sessionQuery,
  navigate,
}: UseSessionHeaderArgs): UseSessionHeaderResult {
  const spec = useMemo(() => findModel(currentModelId), [currentModelId]);

  const handleRename = useCallback(
    async (next: string): Promise<void> => {
      try {
        await trpc.sessions.update.mutate({ id: sessionId, patch: { name: next } });
        await sessionQuery.refetch();
      } catch (err) {
        toast.error(String(err));
      }
    },
    [sessionId, sessionQuery],
  );

  const handleArchive = useCallback(async (): Promise<void> => {
    try {
      await trpc.sessions.archive.mutate({ id: sessionId });
      await navigate({ to: '/workspaces/$workspaceId/sessions', params: { workspaceId } });
    } catch (err) {
      toast.error(String(err));
    }
  }, [sessionId, workspaceId, navigate]);

  return {
    modelLabel: spec?.label ?? currentModelId,
    ...(spec?.provider ? { providerLabel: spec.provider } : {}),
    handleRename,
    handleArchive,
  };
}
