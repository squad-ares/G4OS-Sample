/**
 * Route `/workspaces/:workspaceId/sessions/` — redirect inteligente, NÃO
 * dashboard. CR-UX (2026-04-27): a versão anterior renderizava lista de
 * sessões duplicando a sub-sidebar (sem paridade com V1).
 *
 * Fluxo:
 *   1. Se há `lastSessionId` em `localStorage` E ela existe na lista do
 *      workspace, navegar pra ela.
 *   2. Senão, se a lista tem itens, navegar pra mais recente (primeiro).
 *   3. Senão, criar uma nova session vazia ("Nova sessão") e navegar.
 *      Composer vazio + transcript vazio dão a UX Gemini-like de "comece
 *      a digitar pra abrir uma conversa".
 *
 * Tudo em `useEffect` pra rodar só client-side; durante a transição
 * mostramos `ShellLoadingState` (spinner). Erros do `create.mutate`
 * caem num toast e mantêm usuário na página com retry.
 */
import { ShellLoadingState } from '@g4os/features/shell';
import type { SessionFilter } from '@g4os/kernel/types';
import { toast, useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef } from 'react';
import { queryClient } from '../../ipc/query-client.ts';
import { trpc } from '../../ipc/trpc-client.ts';
import { getLastSessionId } from '../../sessions/last-session.ts';
import { invalidateSessions, sessionsListQueryOptions } from '../../sessions/sessions-store.ts';

export const Route = createFileRoute('/_app/workspaces/$workspaceId/sessions/')({
  component: SessionsIndexRedirect,
});

function SessionsIndexRedirect() {
  const { t } = useTranslate();
  const navigate = useNavigate();
  const { workspaceId } = Route.useParams();
  const inFlightRef = useRef(false);

  const filter = useMemo<SessionFilter>(
    () => ({
      workspaceId,
      lifecycle: 'active',
      includeBranches: false,
      limit: 1,
      offset: 0,
    }),
    [workspaceId],
  );

  const sessionsQuery = useQuery({
    ...sessionsListQueryOptions(filter),
    enabled: workspaceId.length > 0,
  });

  useEffect(() => {
    if (inFlightRef.current) return;
    if (sessionsQuery.isLoading || !sessionsQuery.data) return;

    inFlightRef.current = true;
    const items = sessionsQuery.data.items;
    const lastId = getLastSessionId(workspaceId);
    const lastStillExists = lastId && items.some((s) => s.id === lastId);

    if (lastStillExists) {
      void navigate({
        to: '/workspaces/$workspaceId/sessions/$sessionId',
        params: { workspaceId, sessionId: lastId },
        replace: true,
      });
      return;
    }

    const mostRecent = items[0];
    if (mostRecent) {
      void navigate({
        to: '/workspaces/$workspaceId/sessions/$sessionId',
        params: { workspaceId, sessionId: mostRecent.id },
        replace: true,
      });
      return;
    }

    // Sem histórico — cria uma sessão nova vazia e navega. UX Gemini-like:
    // composer pronto pra digitar imediatamente.
    (async () => {
      try {
        const created = await trpc.sessions.create.mutate({
          workspaceId,
          name: t('session.new.defaultName'),
        });
        await invalidateSessions(queryClient);
        await navigate({
          to: '/workspaces/$workspaceId/sessions/$sessionId',
          params: { workspaceId, sessionId: created.id },
          replace: true,
        });
      } catch (error) {
        inFlightRef.current = false;
        toast.error(t('session.create.failed'), {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  }, [sessionsQuery.isLoading, sessionsQuery.data, workspaceId, navigate, t]);

  return <ShellLoadingState />;
}
