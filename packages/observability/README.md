# @g4os/observability

Observability layer: distributed tracing (OpenTelemetry), crash reporting (Sentry), memory + listener monitoring, Prometheus metrics, and one-click debug info export.

Structured logging lives in [`@g4os/kernel`](../kernel) (`createLogger(scope)`, `createProductionLogger`) — pino is the shared base for every module; this package builds on top.

## Modules

- **`tracer.ts` + `propagation.ts`** — OpenTelemetry API helpers: `withSpan`, `getTracer`, `injectTraceContext`, `runWithExtractedContext`, `getActiveTraceIds`.
- **`sdk/`** — `initTelemetry(options)` lazy-loads `@opentelemetry/sdk-node` + OTLP exporter. NOOP when no `otlpEndpoint` is configured.
- **`sentry/`** — `initSentry(options)` lazy-loads `@sentry/electron/main|renderer` or `@sentry/node`. `scrubSentryEvent` / `scrubObject` / `scrubString` sanitize events and breadcrumbs.
- **`memory/`** — `MemoryMonitor extends DisposableBase` (RSS + heap growth thresholds, `auditProcessListeners`) + `ListenerLeakDetector` (WeakMap + WeakRef, `reportStale`).
- **`metrics/`** — `createMetrics()` returns an isolated `prom-client` Registry with the IPC / session / agent / MCP / worker catalog. `startHistogramTimer` measures via `hrtime.bigint()`.
- **`debug/`** — `exportDebugInfo` produces a sanitized ZIP (`system.json`, `config.json`, `logs/*`, `metrics.prom`, `crashes/`, `processes.json`) with dual redaction (shape + text).

## Stack

- [`@opentelemetry/api@1.9.0`](https://opentelemetry.io/docs/languages/js/) (runtime; NOOP when SDK not initialized)
- [`@opentelemetry/sdk-node@0.215.0`](https://opentelemetry.io/docs/languages/js/instrumentation/) (devDependency, lazy-imported by `initTelemetry`)
- [`@opentelemetry/exporter-trace-otlp-http@0.215.0`](https://opentelemetry.io/docs/specs/otlp/) (devDependency, lazy)
- [`prom-client@15.1.3`](https://github.com/siimon/prom-client) (runtime, Prometheus text format)
- [`archiver@7.0.1`](https://github.com/archiverjs/node-archiver) (ZIP export for debug bundles)
- `@sentry/electron` / `@sentry/node` are **not** declared here — consumers (apps/desktop) install them. `initSentry` resolves the specifier dynamically.

## Key ADRs

- **ADR-0060:** pino as the single structured logger (wrapper + `pino-roll` transports) — implemented in `@g4os/kernel`
- **ADR-0061:** OpenTelemetry API runtime + SDK Node lazy-loaded + W3C Trace Context propagation
- **ADR-0062:** Sentry with central `beforeSend`/`beforeBreadcrumb` scrub; lazy init; NOOP without DSN
- **ADR-0063:** MemoryMonitor + ListenerLeakDetector (DisposableBase, WeakMap + WeakRef)
- **ADR-0064:** `prom-client` with injectable `Registry`, catalog in `metrics/registry.ts`
- **ADR-0065:** Debug info export (ZIP + dual redaction)

## Usage

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

`withSpan` sets OK status on resolve, records the exception and ERROR status on reject, and always ends the span.

### Context propagation (IPC / HTTP)

```ts
import { getActiveTraceIds, injectTraceContext, runWithExtractedContext } from '@g4os/observability';

// Outbound (main → worker or main → HTTP)
const headers: Record<string, string> = {};
injectTraceContext(headers);
worker.postMessage({ type: 'job', headers, payload });

// Inbound (worker receiving the message)
runWithExtractedContext(message.headers, async () => {
  const { traceId, spanId } = getActiveTraceIds();
  // ... work runs inside the parent trace
});
```

### OpenTelemetry SDK bootstrap

```ts
import { initTelemetry } from '@g4os/observability/sdk';

const telemetry = await initTelemetry({
  serviceName: 'g4os-main',
  serviceVersion: app.getVersion(),
  process: 'main',
  otlpEndpoint: process.env['OTLP_ENDPOINT'], // undefined → NOOP
  tracesSampleRate: 0.1,
});

// on graceful shutdown
await telemetry.shutdown();
```

### Sentry bootstrap

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

// graceful shutdown
await sentry.close();
```

`scrubSentryEvent` is wired by default as both `beforeSend` and `beforeBreadcrumb`.

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

// on shutdown
monitor.dispose();

// one-off listener audit
const hot = auditProcessListeners(['uncaughtException', 'unhandledRejection'], 5);
```

### Listener leak detector

```ts
import { ListenerLeakDetector } from '@g4os/observability/memory';

const detector = new ListenerLeakDetector();

emitter.on('message', handler);
detector.track(emitter, 'message', handler);

// later
emitter.off('message', handler);
detector.untrack(emitter, 'message', handler);

// periodic scan
const stale = detector.reportStale(60_000);
for (const { target, event, ageMs } of stale) {
  log.warn({ event, ageMs }, 'stale listener');
}
```

### Metrics

```ts
import { getMetrics, exportMetrics, startHistogramTimer } from '@g4os/observability/metrics';

const metrics = getMetrics();

// Counter + Gauge
metrics.sessionActive.inc();
metrics.ipcRequestTotal.labels({ procedure: 'sessions.list', type: 'query', status: 'ok' }).inc();

// Histogram via timer
const timer = startHistogramTimer(metrics.ipcRequestDuration, {
  procedure: 'sessions.list',
  type: 'query',
});
const result = await doWork();
timer.end({ status: 'ok' });

// HTTP or tRPC endpoint for Prometheus scraping
const body = await exportMetrics();
```

Catalog (labels shown in parentheses):
- `g4os_ipc_request_duration_seconds` / `g4os_ipc_request_total` (`procedure`, `type`, `status`)
- `g4os_session_active_count`
- `g4os_agent_request_duration_seconds` (`agent`, `status`) / `g4os_agent_tokens_total` (`agent`, `type`)
- `g4os_mcp_subprocess_count` / `g4os_mcp_tool_call_duration_seconds` (`tool`, `source`, `status`) / `g4os_mcp_subprocess_crash_total` (`source`)
- `g4os_worker_memory_rss_bytes` (`session_id`) / `g4os_worker_restart_total` (`session_id`, `reason`)

### Debug info export

```ts
import { exportDebugInfo } from '@g4os/observability/debug';

const result = await exportDebugInfo({
  outputPath: '/tmp/g4os-debug.zip',
  systemInfo: {
    app: { name: app.getName(), version: app.getVersion() },
    platform: {
      os: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      memoryTotalBytes: os.totalmem(),
      cpus: os.cpus().length,
    },
  },
  config: await loadConfig(),              // scrubbed by shape
  logsDir: getAppPaths().logs,             // re-scrubbed by text (default last 7 days, cap 10 MiB/log)
  crashesDir: app.getPath('crashDumps'),
  processSnapshot: await getProcessTree(),
});
// → { outputPath, byteLength, entries }
```

Redaction happens in two layers:
1. `scrubObject(config)` — removes sensitive keys (`apiKey`, `token`, `password`, …) at any depth.
2. `scrubString(logContent)` — regex-redacts `sk-*`, `AIza*`, and JWT patterns in raw log text.

## Testing

```bash
pnpm --filter @g4os/observability test
```

Test files in `src/__tests__/*.test.ts` cover: tracer + propagation, Sentry scrub (depth/circular/patterns/immutability), memory monitor (fake clock, thresholds, dispose), leak detector, Prometheus registry, debug ZIP export (entries + zero-secrets validation).

## Exports

```ts
import { ... } from '@g4os/observability'          // tracer + propagation + type re-exports
import { ... } from '@g4os/observability/sdk'      // initTelemetry (lazy OTel SDK)
import { ... } from '@g4os/observability/sentry'   // initSentry + scrub helpers
import { ... } from '@g4os/observability/memory'   // MemoryMonitor + ListenerLeakDetector
import { ... } from '@g4os/observability/metrics'  // createMetrics + timers
import { ... } from '@g4os/observability/debug'    // exportDebugInfo + redact helpers
```

## Boundary

`@g4os/observability` may depend only on `@g4os/kernel` and `@g4os/platform` (enforced by `dependency-cruiser` rule `observability-isolated`). Features and agents consume observability via these subpath exports — they do not import implementation files directly.
