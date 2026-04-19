import { createLogger } from '@g4os/kernel/logger';
import { DiagLogLevel, diag } from '@opentelemetry/api';

const log = createLogger('observability:sdk');

export type ProcessKind = 'main' | 'worker' | 'renderer';

export interface TelemetryInitOptions {
  readonly serviceName: string;
  readonly serviceVersion: string;
  readonly processType: ProcessKind;
  readonly otlpEndpoint?: string | undefined;
  readonly sampleRatio?: number | undefined;
  readonly resourceAttributes?: Readonly<Record<string, string | number | boolean>>;
}

export interface TelemetryHandle {
  shutdown(): Promise<void>;
}

const NOOP_HANDLE: TelemetryHandle = { shutdown: () => Promise.resolve() };

interface SdkNodeModule {
  NodeSDK: new (
    opts: Record<string, unknown>,
  ) => {
    start(): void;
    shutdown(): Promise<void>;
  };
}

interface OtlpExporterModule {
  OTLPTraceExporter: new (opts: Record<string, unknown>) => unknown;
}

interface ResourcesModule {
  resourceFromAttributes(attrs: Record<string, unknown>): unknown;
}

interface SamplerModule {
  TraceIdRatioBasedSampler: new (ratio: number) => unknown;
  ParentBasedSampler: new (opts: { root: unknown }) => unknown;
}

export async function initTelemetry(options: TelemetryInitOptions): Promise<TelemetryHandle> {
  if (!options.otlpEndpoint) {
    log.info({ processType: options.processType }, 'otel disabled (no endpoint); returning noop');
    return NOOP_HANDLE;
  }

  diag.setLogger(
    {
      verbose: (msg, ...args) => log.debug({ args }, msg),
      debug: (msg, ...args) => log.debug({ args }, msg),
      info: (msg, ...args) => log.info({ args }, msg),
      warn: (msg, ...args) => log.warn({ args }, msg),
      error: (msg, ...args) => log.error({ args }, msg),
    },
    DiagLogLevel.WARN,
  );

  const [{ NodeSDK }, { OTLPTraceExporter }, { resourceFromAttributes }, sampler] =
    await Promise.all([loadSdkNode(), loadOtlpExporter(), loadResources(), loadSampler()]);

  const baseAttrs: Record<string, unknown> = {
    'service.name': options.serviceName,
    'service.version': options.serviceVersion,
    'process.type': options.processType,
  };
  if (options.resourceAttributes) {
    for (const [k, v] of Object.entries(options.resourceAttributes)) {
      baseAttrs[k] = v;
    }
  }

  const ratio = options.sampleRatio ?? 0.1;
  const rootSampler = new sampler.TraceIdRatioBasedSampler(ratio);
  const parentSampler = new sampler.ParentBasedSampler({ root: rootSampler });

  const sdk = new NodeSDK({
    resource: resourceFromAttributes(baseAttrs),
    traceExporter: new OTLPTraceExporter({ url: options.otlpEndpoint }),
    sampler: parentSampler,
  });

  sdk.start();
  log.info(
    { endpoint: options.otlpEndpoint, ratio, processType: options.processType },
    'otel sdk started',
  );

  return {
    shutdown: async () => {
      try {
        await sdk.shutdown();
        log.info({ processType: options.processType }, 'otel sdk shut down');
      } catch (err) {
        log.warn({ err }, 'otel sdk shutdown failed');
      }
    },
  };
}

async function loadSdkNode(): Promise<SdkNodeModule> {
  const specifier = '@opentelemetry/sdk-node';
  return (await import(/* @vite-ignore */ specifier)) as SdkNodeModule;
}

async function loadOtlpExporter(): Promise<OtlpExporterModule> {
  const specifier = '@opentelemetry/exporter-trace-otlp-http';
  return (await import(/* @vite-ignore */ specifier)) as OtlpExporterModule;
}

async function loadResources(): Promise<ResourcesModule> {
  const specifier = '@opentelemetry/resources';
  return (await import(/* @vite-ignore */ specifier)) as ResourcesModule;
}

async function loadSampler(): Promise<SamplerModule> {
  const specifier = '@opentelemetry/sdk-trace-base';
  return (await import(/* @vite-ignore */ specifier)) as SamplerModule;
}
