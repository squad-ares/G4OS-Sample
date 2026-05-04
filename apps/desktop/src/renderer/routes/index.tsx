import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@g4os/features/workspaces';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { ensureAuthState } from '../auth/auth-store.ts';
import { workspacesListQueryOptions } from '../workspaces/workspaces-store.ts';

function readActiveWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistActiveWorkspaceId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, id);
  } catch {
    // localStorage indisponível — workspaceId será re-resolvido no próximo boot
  }
}

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const auth = await ensureAuthState(context.queryClient);
    if (auth.status !== 'authenticated') {
      throw redirect({ to: '/login' });
    }

    // Caminho rápido: localStorage tem id válido. Não validamos contra a
    // lista do servidor aqui pra não pagar IPC desnecessário; se o id for
    // stale (workspace deletado), `_app/workspaces/$workspaceId` cuida do
    // 404 e oferece recovery.
    const activeWorkspaceId = readActiveWorkspaceId();
    if (activeWorkspaceId && activeWorkspaceId.length > 0) {
      throw redirect({
        to: '/workspaces/$workspaceId',
        params: { workspaceId: activeWorkspaceId },
      });
    }

    // Sem workspace persistido — verifica se o usuário já tem algum.
    // Se sim, navega pro mais recente (paridade V1). Se não, encaminha
    // para o wizard de setup: mesmo fluxo do V1 que impedia entrar no
    // sistema sem ter configurado pelo menos um workspace.
    const workspaces = await context.queryClient.ensureQueryData(workspacesListQueryOptions());
    const mostRecent = workspaces[0];
    if (mostRecent) {
      persistActiveWorkspaceId(mostRecent.id);
      throw redirect({
        to: '/workspaces/$workspaceId',
        params: { workspaceId: mostRecent.id },
      });
    }

    // Nenhum workspace existente — wizard obrigatório antes de acessar o shell.
    throw redirect({ to: '/workspaces/new' });
  },
  component: () => null,
});
