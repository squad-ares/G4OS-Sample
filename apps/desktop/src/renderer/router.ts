import { ShellLoadingState } from '@g4os/features/shell';
import { createRouter } from '@tanstack/react-router';
import { queryClient } from './ipc/query-client.ts';
import type { RouterContext } from './router-context.ts';
import { routeTree } from './routeTree.gen.ts';

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultPendingComponent: ShellLoadingState,
  context: { queryClient } satisfies RouterContext,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
