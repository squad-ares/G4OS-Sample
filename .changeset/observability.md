---
'@g4os/observability': minor
'@g4os/kernel': minor
---

Observability epic 06: `pino` como logger único (kernel) com redação nativa + `pino-roll` transports (`app.log`/`error.log`, diário, 100M, hist 7) e `createProductionLogger`. `@g4os/observability` novo: OpenTelemetry API + SDK lazy (`withSpan`, `injectTraceContext`, `runWithExtractedContext`, `initTelemetry` W3C + ParentBased/TraceIdRatio); `initSentry` lazy para main/renderer/node com `beforeSend`/`beforeBreadcrumb` centrais via `scrubSentryEvent` (deep `scrubObject` + regex `scrubString`); `MemoryMonitor extends DisposableBase` (thresholds RSS + heap growth, `auditProcessListeners`) e `ListenerLeakDetector` (WeakMap + WeakRef + `reportStale`); `createMetrics()`/`getMetrics()` com catálogo IPC/session/agent/MCP/worker + `startHistogramTimer` (`hrtime.bigint`); `exportDebugInfo` gera ZIP sanitizado (`system.json`+`config.json`+`logs/*`+`metrics.prom`+`crashes/`+`processes.json`) com redação dupla (shape + texto). Subpath exports: `@g4os/observability/{sdk,sentry,memory,metrics,debug}`. ADRs 0060–0065.
