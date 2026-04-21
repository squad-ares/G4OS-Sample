import { QueryClient } from '@tanstack/react-query';

/**
 * Instância única de `QueryClient` compartilhada entre `main.tsx` (provider)
 * e o router (`beforeLoad`). Guards leem do cache dessa instância; sem ela,
 * cada guard rodaria sua própria query e voltaria o loop de redirect.
 */
export const queryClient: QueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});
