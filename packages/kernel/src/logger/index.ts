export * from './log-stream.ts';
export * from './logger.ts';
// `transport.ts` é Node-only (importa `node:path`, `pino-roll`). NÃO
// re-exportar do barrel — quem precisa em prod boot importa via
// `@g4os/kernel/logger-transport`. Sem isso, o renderer Electron acaba
// puxando `node:path` quando carrega a cadeia (init-sentry → observability
// → kernel/logger), o que crashea com `Module externalized for browser`.
