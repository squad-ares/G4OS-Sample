/**
 * Shim de tipos para `@sentry/*` carregados via dynamic import literal em
 * `@g4os/observability/sentry/init.ts`. Mesma duplicação intencional do
 * shim em `packages/observability/src/sentry/sentry-modules.d.ts` — cada
 * tsconfig precisa do shim no seu próprio include path. `@sentry/electron`
 * é runtime dep deste app, mas o pnpm `.pnpm/` storage não disponibiliza
 * os subpaths `/renderer` e `/main` para TS resolver via consumer.
 */
declare module '@sentry/electron/renderer' {
  const sentryRenderer: Record<string, unknown>;
  export = sentryRenderer;
}

declare module '@sentry/electron/main' {
  const sentryMain: Record<string, unknown>;
  export = sentryMain;
}

declare module '@sentry/node' {
  const sentryNode: Record<string, unknown>;
  export = sentryNode;
}
