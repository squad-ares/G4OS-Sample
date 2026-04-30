/**
 * Wiring mínimo de observability para o main process.
 *
 * Cada pilar é opt-in por env var — sem configuração, o pacote devolve
 * um handle NOOP. Isso evita que dev local pague o custo de exportar
 * traces/crashes e mantém o caminho de produção ligando tudo quando o
 * release injeta os endpoints/DSN.
 *
 * Env vars:
 *   - `G4OS_OTEL_ENDPOINT`        → habilita OpenTelemetry (ex: http://localhost:4318/v1/traces)
 *   - `G4OS_OTEL_SAMPLE_RATIO`    → (opcional) 0..1, default 0.1
 *   - `G4OS_SENTRY_DSN`           → habilita Sentry crash reporting
 *   - `G4OS_SENTRY_ENVIRONMENT`   → (opcional) default 'development' | 'production'
 *   - `G4OS_SENTRY_RELEASE`       → (opcional) default app.version
 *   - `G4OS_MEMORY_INTERVAL_MS`   → (opcional) default 30_000
 *
 * ADRs relacionadas: 0060 (pino), 0061 (OTel), 0062 (Sentry), 0063 (memory).
 */

import type { Server } from 'node:http';
import { createLogger } from '@g4os/kernel/logger';
import { ListenerLeakDetector, MemoryMonitor } from '@g4os/observability/memory';
import { initTelemetry, type TelemetryHandle } from '@g4os/observability/sdk';
import { initSentry, type SentryHandle } from '@g4os/observability/sentry';
import { readRuntimeEnv } from '../runtime-env.ts';
import { startMetricsScrapeServer } from './metrics-scrape-server.ts';

const log = createLogger('observability-runtime');

export interface ObservabilityRuntimeOptions {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly environment: string;
}

export interface ObservabilityRuntime {
  readonly telemetry: TelemetryHandle;
  readonly sentry: SentryHandle;
  readonly memory: MemoryMonitor;
  /**
   * Detector global de listener leaks. Subsistemas que se
   * importam (DisposableBase, EventEmitter wrappers) chamam
   * `listenerDetector.track(target, event, handler)` em paralelo ao
   * `addListener`, e `untrack` no `removeListener`. O Debug HUD consome
   * `snapshot()` para visualizar.
   */
  readonly listenerDetector: ListenerLeakDetector;
  dispose(): Promise<void>;
}

export async function createObservabilityRuntime(
  options: ObservabilityRuntimeOptions,
): Promise<ObservabilityRuntime> {
  const otlpEndpoint = readRuntimeEnv('G4OS_OTEL_ENDPOINT');
  const sampleRatioRaw = readRuntimeEnv('G4OS_OTEL_SAMPLE_RATIO');
  const sampleRatio = sampleRatioRaw === undefined ? undefined : Number(sampleRatioRaw);
  const sentryDsn = readRuntimeEnv('G4OS_SENTRY_DSN');
  const sentryEnvironment = readRuntimeEnv('G4OS_SENTRY_ENVIRONMENT') ?? options.environment;
  const sentryRelease = readRuntimeEnv('G4OS_SENTRY_RELEASE') ?? options.serviceVersion;
  const memoryIntervalRaw = readRuntimeEnv('G4OS_MEMORY_INTERVAL_MS');
  const memoryIntervalMs = memoryIntervalRaw === undefined ? undefined : Number(memoryIntervalRaw);

  const telemetry = await initTelemetry({
    serviceName: options.serviceName,
    serviceVersion: options.serviceVersion,
    processType: 'main',
    otlpEndpoint,
    sampleRatio: Number.isFinite(sampleRatio) ? sampleRatio : undefined,
  });

  const sentry = await initSentry({
    dsn: sentryDsn,
    release: sentryRelease,
    environment: sentryEnvironment,
    process: 'main',
  });

  const baseMemoryOptions = {
    onThresholdExceeded: (reason: string, sample: unknown) => {
      log.warn({ reason, sample }, 'memory threshold exceeded in main');
    },
  };
  const memoryOptions =
    memoryIntervalMs !== undefined && Number.isFinite(memoryIntervalMs)
      ? { ...baseMemoryOptions, intervalMs: memoryIntervalMs }
      : baseMemoryOptions;
  const memory = new MemoryMonitor(memoryOptions);
  memory.start();

  // Detector global de listeners para o Debug HUD.
  // Inocuo até subsistemas chamarem `track()/untrack()` — sem isso,
  // `snapshot()` retorna vazio e o card mostra placeholder.
  const listenerDetector = new ListenerLeakDetector();

  // Expõe /metrics no formato Prometheus para scrape local quando OTel está ativo.
  const metricsServer: Server | null = otlpEndpoint ? startMetricsScrapeServer() : null;

  log.info(
    {
      otel: Boolean(otlpEndpoint),
      sentry: Boolean(sentryDsn),
      metricsPort: metricsServer ? 9464 : null,
    },
    'observability runtime inicializado',
  );

  return {
    telemetry,
    sentry,
    memory,
    listenerDetector,
    dispose: async () => {
      metricsServer?.close();
      memory.dispose();
      await Promise.all([telemetry.shutdown(), sentry.close()]);
    },
  };
}
