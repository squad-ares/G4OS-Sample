/**
 * Hook que detecta workspace recém-criado sem sessions e dispara auto-create
 * de "Workspace Setup" session com prompt inicial guiado.
 *
 * Equivalente ao auto-trigger V1 (`App.tsx:1431-1450`):
 *   - workspace.setupCompleted === false
 *   - sessions.length === 0
 *   → cria session + envia mensagem inicial pedindo ajuda no setup
 *
 * MVP sem skills bundled (TASK-CR1-18 plantará `/setup` como skill formal).
 * Por enquanto envia prompt em texto plano que o agent responde.
 *
 * Uso: chamar uma vez no shell autenticado quando workspace ativo carrega.
 * Hook usa `dispatchedRef` para garantir disparo único por (workspaceId, mount).
 */

import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { trpc } from '../ipc/trpc-client.ts';

const SETUP_KICKOFF_PROMPT_PT_BR = [
  'Olá! Acabei de criar este workspace.',
  '',
  'Pode me ajudar a configurá-lo? Eu gostaria que você:',
  '1. Pergunte sobre meus principais objetivos com este workspace',
  '2. Sugira sources/MCPs úteis para o que eu pretendo fazer',
  '3. Ajude a definir um working directory adequado',
  '4. Crie um esboço de notas em `context/workspace-context.md` resumindo o setup',
  '',
  'Quando terminar, me avise para eu marcar o setup como concluído nas configurações.',
].join('\n');

interface UseFirstLoginSetupArgs {
  readonly activeWorkspaceId: string | null;
  readonly hasSessions: boolean;
  readonly onSessionCreated: (sessionId: string, workspaceId: string) => void;
}

export function useFirstLoginSetup({
  activeWorkspaceId,
  hasSessions,
  onSessionCreated,
}: UseFirstLoginSetupArgs): void {
  const dispatchedRef = useRef<Set<string>>(new Set());

  const setupNeedsQuery = useQuery({
    queryKey: ['workspaces', 'setup-needs', activeWorkspaceId],
    queryFn: () =>
      activeWorkspaceId
        ? trpc.workspaces.getSetupNeeds.query({ id: activeWorkspaceId })
        : Promise.reject(new Error('no workspace')),
    enabled: !!activeWorkspaceId,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!activeWorkspaceId) return;
    if (hasSessions) return;
    if (dispatchedRef.current.has(activeWorkspaceId)) return;
    if (!setupNeedsQuery.data?.needsInitialSetup) return;

    dispatchedRef.current.add(activeWorkspaceId);
    void runAutoSetup(activeWorkspaceId, onSessionCreated);
  }, [activeWorkspaceId, hasSessions, setupNeedsQuery.data, onSessionCreated]);
}

async function runAutoSetup(
  workspaceId: string,
  onSessionCreated: (sessionId: string, workspaceId: string) => void,
): Promise<void> {
  try {
    const session = await trpc.sessions.create.mutate({
      workspaceId,
      name: 'Workspace Setup',
    });
    await trpc.sessions.sendMessage.mutate({
      id: session.id,
      text: SETUP_KICKOFF_PROMPT_PT_BR,
    });
    onSessionCreated(session.id, workspaceId);
  } catch {
    // best-effort — falhas não bloqueiam o shell
  }
}
