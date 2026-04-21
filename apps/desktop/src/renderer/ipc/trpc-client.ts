import type { AppRouter } from '@g4os/ipc/server';
import { createTRPCClient } from '@trpc/client';
import { ipcLink } from './ipc-link.ts';

export { createTRPCReact } from '@trpc/react-query';

export const trpc = createTRPCClient<AppRouter>({
  links: [ipcLink()],
});
