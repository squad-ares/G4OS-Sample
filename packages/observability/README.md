# @g4os/observability

Camada de observability: tracing distribuído (OpenTelemetry), crash reporting (Sentry), monitoramento de memória e listeners, métricas Prometheus e export one-click de debug info.

Logging estruturado vive em [`@g4os/kernel`](../kernel) (`createLogger(scope)`, `createProductionLogger`) — pino é a base compartilhada; este pacote constrói em cima.

## Módulos

- **`tracer.ts` + `propagation.ts`** — helpers de API OpenTelemetry: `withSpan`, `getTracer`, `injectTraceContext`, `runWithExtractedContext`, `getActiveTraceIds`.
- **`sdk/`** — `initTelemetry(options)` faz lazy-load de `@opentelemetry/sdk-node` + exporter OTLP. NOOP quando não há `otlpEndpoint`.
- **`sentry/`** — `initSentry(options)` faz lazy-load de `@sentry/electron/main|renderer` ou `@sentry/node`. `scrubSentryEvent`/`scrubObject`/`scrubString` sanitizam eventos e breadcrumbs.
- **`memory/`** — `MemoryMonitor extends DisposableBase` (thresholds RSS + growth de heap, `auditProcessListeners`) + `ListenerLeakDetector` (WeakMap + WeakRef, `reportStale`).
- **`metrics/`** — `createMetrics()` devolve um `Registry` isolado de `prom-client` com catálogo IPC/session/agent/MCP/worker. `startHistogramTimer` mede via `hrtime.bigint()`.
- **`debug/`** — `exportDebugInfo` produz ZIP sanitizado (`system.json`, `config.json`, `logs/*`, `metrics.prom`, `crashes/`, `processes.json`) com redação dupla (shape + texto).

## Stack

- [`@opentelemetry/api@1.9.0`](https://opentelemetry.io/docs/languages/js/) (runtime; NOOP sem SDK inicializada)
- [`@opentelemetry/sdk-node@0.215.0`](https://opentelemetry.io/docs/languages/js/instrumentation/) (devDependency, lazy-importada por `initTelemetry`)
- [`@opentelemetry/exporter-trace-otlp-http@0.215.0`](https://opentelemetry.io/docs/specs/otlp/) (devDependency, lazy)
- [`prom-client@15.1.3`](https://github.com/siimon/prom-client) (runtime)
- [`archiver@7.0.1`](https://github.com/archiverjs/node-archiver) (ZIP para debug)
- `@sentry/electron` / `@sentry/node` **não** são declarados aqui — consumidores (apps/desktop) instalam. `initSentry` resolve o specifier dinamicamente.

## ADRs principais

- **ADR-0060:** pino como único logger estruturado (wrapper + transports `pino-roll`) — implementado em `@g4os/kernel`
- **ADR-0061:** OpenTelemetry API em runtime + SDK Node lazy + propagação W3C Trace Context
- **ADR-0062:** Sentry com `beforeSend`/`beforeBreadcrumb` centrais + init lazy + NOOP sem DSN
- **ADR-0063:** MemoryMonitor + ListenerLeakDetector (DisposableBase, WeakMap + WeakRef)
- **ADR-0064:** `prom-client` com `Registry` injetável, catálogo em `metrics/registry.ts`
- **ADR-0065:** Export de debug info (ZIP + redação dupla)

## Uso

### Tracing (`withSpan`)

```ts
import { withSpan } from '@g4os/observability';

const user = await withSpan(
  'auth.loadUser',
  { attributes: { 'user.id': userId } },
  async (span) => {
    span.setAttribute('cache.hit', false);
    return await fetchUser(userId);
  },
);
```

`withSpan` seta status OK no resolve, registra a exception + status ERROR no reject, e sempre finaliza o span.

### Propagação de contexto (IPC / HTTP)

```ts
import { getActiveTraceIds, injectTraceContext, runWithExtractedContext } from '@g4os/observability';

// Saída (main → worker ou main → HTTP)
const headers: Record<string, string> = {};
injectTraceContext(headers);
worker.postMessage({ type: 'job', headers, payload });

// Entrada (worker recebe)
runWithExtractedContext(message.headers, async () => {
  const { traceId, spanId } = getActiveTraceIds();
  // ... trabalho roda dentro do trace pai
});
```

### Bootstrap OTel SDK

```ts
import { initTelemetry } from '@g4os/observability/sdk';

const telemetry = await initTelemetry({
  serviceName: 'g4os-main',
  serviceVersion: app.getVersion(),
  processType: 'main',
  otlpEndpoint: process.env['OTLP_ENDPOINT'], // undefined → NOOP
  sampleRatio: 0.1,
});

// no shutdown graceful
await telemetry.shutdown();
```

### Bootstrap Sentry

```ts
import { initSentry } from '@g4os/observability/sentry';

const sentry = await initSentry({
  dsn: process.env['SENTRY_DSN'], // undefined → NOOP
  release: app.getVersion(),
  environment: 'production',
  process: 'main', // 'main' | 'renderer' | 'worker'
});

sentry.setUser({ id: userId, email: userEmail });
sentry.setTag('workspace_id', workspaceId);
await sentry.close();
```

### Memory monitor

```ts
import { MemoryMonitor, auditProcessListeners } from '@g4os/observability/memory';

const monitor = new MemoryMonitor({
  intervalMs: 30_000,
  thresholds: {
    rssBytes: 1_500 * 1024 * 1024,
    heapGrowthRatio: 2.0,
  },
  onThresholdExceeded: (reason, sample) => {
    metrics.workerMemoryRss.set({ session_id: id }, sample.rssBytes);
    log.warn({ reason, sample }, 'memory threshold exceeded');
  },
});
monitor.start();
monitor.dispose();
```

### Métricas

```ts
import { getMetrics, exportMetrics, startHistogramTimer } from '@g4os/observability/metrics';

const metrics = getMetrics();
metrics.sessionActive.inc();
metrics.ipcRequestTotal.labels({ procedure: 'sessions.list', type: 'query', status: 'ok' }).inc();

const timer = startHistogramTimer(metrics.ipcRequestDuration, { procedure: 'sessions.list', type: 'query' });
const result = await doWork();
timer.end({ status: 'ok' });

const body = await exportMetrics();
```

Catálogo:
- `g4os_ipc_request_duration_seconds` / `g4os_ipc_request_total` (`procedure`, `type`, `status`)
- `g4os_session_active_count`
- `g4os_agent_request_duration_seconds` (`agent`, `status`) / `g4os_agent_tokens_total` (`agent`, `type`)
- `g4os_mcp_subprocess_count` / `g4os_mcp_tool_call_duration_seconds` (`tool`, `source`, `status`) / `g4os_mcp_subprocess_crash_total` (`source`)
- `g4os_worker_memory_rss_bytes` (`session_id`) / `g4os_worker_restart_total` (`session_id`, `reason`)

### Export de debug info

```ts
import { exportDebugInfo } from '@g4os/observability/debug';

const result = await exportDebugInfo({
  outputPath: '/tmp/g4os-debug.zip',
  systemInfo: { ... },
  config: await loadConfig(),
  logsDir: getAppPaths().logs,
  crashesDir: app.getPath('crashDumps'),
  processSnapshot: await getProcessTree(),
});
```

Redação em duas camadas:
1. `scrubObject(config)` — remove chaves sensíveis (`apiKey`, `token`, `password`, …) em qualquer profundidade.
2. `scrubString(logContent)` — regex redige `sk-*`, `AIza*` e JWTs em texto puro.

## Testes

```bash
pnpm --filter @g4os/observability test
```

Cobertura: tracer + propagação, scrub do Sentry, memory monitor (fake clock + thresholds + dispose), leak detector, registry Prometheus, debug ZIP.

## Exports

```ts
import { ... } from '@g4os/observability'          // tracer + propagação + tipos
import { ... } from '@g4os/observability/sdk'      // initTelemetry (lazy OTel SDK)
import { ... } from '@g4os/observability/sentry'   // initSentry + scrub
import { ... } from '@g4os/observability/memory'   // MemoryMonitor + ListenerLeakDetector
import { ... } from '@g4os/observability/metrics'  // createMetrics + timers
import { ... } from '@g4os/observability/debug'    // exportDebugInfo + redactors
```

## Fronteira

`@g4os/observability` pode depender apenas de `@g4os/kernel` e `@g4os/platform` (regra `observability-isolated`). Features e agentes consomem via subpaths — não importam arquivos de implementação diretamente.
