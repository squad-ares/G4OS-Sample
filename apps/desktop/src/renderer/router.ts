import { ShellLoadingState } from '@g4os/features/shell';
import { createHashHistory, createRouter } from '@tanstack/react-router';
import { queryClient } from './ipc/query-client.ts';
import { RouteErrorBoundary } from './route-error-boundary.tsx';
import type { RouterContext } from './router-context.ts';
import { routeTree } from './routeTree.gen.ts';

// Em Electron empacotado, `file://...index.html` faz o browserHistory
// interpretar o path do bundle como rota e mostrar Page Not Found.
// Hash history (`#/sessions`) sobrevive a file:// e dev server.
const history = createHashHistory();

export const router = createRouter({
  routeTree,
  history,
  defaultPreload: 'intent',
  defaultPendingComponent: ShellLoadingState,
  // Sem errorComponent, qualquer throw em beforeLoad que NÃO seja redirect()
  // pendura o app em "Loading environment…" sem caminho de recovery.
  // RouteErrorBoundary mostra o erro real + botão de "Voltar pro login".
  defaultErrorComponent: RouteErrorBoundary,
  context: { queryClient } satisfies RouterContext,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
