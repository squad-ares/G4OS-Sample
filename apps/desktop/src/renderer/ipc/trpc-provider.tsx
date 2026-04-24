import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { ipcLink } from './ipc-link.ts';
import { queryClient } from './query-client.ts';
import { trpcReact } from './trpc-react.ts';

export function TRPCProvider({ children }: { readonly children: ReactNode }) {
  const [trpcClient] = useState(() =>
    trpcReact.createClient({
      links: [ipcLink()],
    }),
  );

  return (
    <trpcReact.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpcReact.Provider>
  );
}
