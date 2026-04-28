import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@g4os/features/workspaces';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { ensureAuthState } from '../auth/auth-store.ts';
import { trpc } from '../ipc/trpc-client.ts';
import {
  invalidateWorkspaces,
  workspacesListQueryOptions,
} from '../workspaces/workspaces-store.ts';

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

    // CR-UX: sem workspace persistido — verifica se o usuário já tem algum.
    // Se sim, navega pro mais recente (UX V1 paridade). Se não, cria um
    // default automaticamente e marca como pendente de setup, pra
    // `useFirstLoginSetup` disparar o auto-onboarding na primeira sessão.
    // Sem isso, usuário caía no `/workspaces/` (lista vazia) e precisava
    // clicar em "Criar workspace" manualmente — fricção desnecessária.
    const workspaces = await context.queryClient.ensureQueryData(workspacesListQueryOptions());
    const mostRecent = workspaces[0];
    if (mostRecent) {
      persistActiveWorkspaceId(mostRecent.id);
      throw redirect({
        to: '/workspaces/$workspaceId',
        params: { workspaceId: mostRecent.id },
      });
    }

    try {
      // `rootPath` opcional pelo schema; o service resolve default via
      // `appPaths.workspace(id)` quando ausente. `name` é o único required.
      const created = await trpc.workspaces.create.mutate({
        name: 'My Workspace',
      });
      await invalidateWorkspaces(context.queryClient);
      persistActiveWorkspaceId(created.id);
      throw redirect({
        to: '/workspaces/$workspaceId',
        params: { workspaceId: created.id },
      });
    } catch (err) {
      // O `redirect()` é throwado como controle de flow, NÃO é erro real.
      // Re-throw pra que tanstack-router processe a navegação.
      if (err && typeof err === 'object' && 'to' in err) throw err;
      // Falha real ao criar (ex: slug duplicado por race) — manda pra
      // lista para o user resolver manualmente.
      throw redirect({ to: '/workspaces/' });
    }
  },
  component: () => null,
});
