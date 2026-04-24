import type { QueryClient } from '@tanstack/react-query';

/**
 * Tipo do contexto exposto para cada `beforeLoad`. Mora num módulo
 * separado porque `__root.tsx` precisa tipar o `createRootRouteWithContext`
 * antes de `router.ts` existir — evitar ciclo:
 *
 *   router.ts → routeTree.gen.ts → __root.tsx → router.ts
 */
export interface RouterContext {
  readonly queryClient: QueryClient;
}
