/**
 * Shim de tipos para os 3 entry points do `@sentry/*` que carregamos
 * via dynamic import por process type. Pacotes reais ficam em
 * `apps/desktop/node_modules` (deps de runtime do app, não da lib).
 *
 * O tipo concreto que usamos internamente é `SentryClientModule`
 * (definido em `init.ts`) — fazemos `as unknown as SentryClientModule`
 * pra não acoplar à API completa do `@sentry/*`. Esse `.d.ts` existe
 * apenas para que `tsc` resolva o specifier nos `import()` literais
 * sem precisar declarar `@sentry/electron` como dep da lib (zero
 * runtime — Vite/tsup cuidam da resolução do bundle real).
 */
declare module '@sentry/electron/renderer' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sentryRenderer: Record<string, unknown>;
  export = sentryRenderer;
}

declare module '@sentry/electron/main' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sentryMain: Record<string, unknown>;
  export = sentryMain;
}

declare module '@sentry/node' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sentryNode: Record<string, unknown>;
  export = sentryNode;
}
