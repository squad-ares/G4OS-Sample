/**
 * Probe ativo de conectividade pra os endpoints de observability.
 *
 * `ObservabilityRuntime` expõe quais serviços estão *configurados* (env
 * vars presentes), mas configuração ≠ conectividade. Este módulo faz HTTP
 * HEAD com timeout curto contra cada endpoint pra reportar reachability
 * real ao usuário (`Configurado mas inacessível` vs `Ativo (45ms)`).
 *
 * Usa `fetch` global (Node 24 / undici). Qualquer resposta HTTP (200, 404,
 * 405, 500) é considerada "alcançável" — só erros de rede (ECONNREFUSED,
 * DNS, TLS, timeout) marcam como `reachable: false`.
 */

import { createLogger } from '@g4os/kernel/logger';

const log = createLogger('services-prober');

const PROBE_TIMEOUT_MS = 3000;

export interface ServiceStatus {
  readonly configured: boolean;
  readonly reachable: boolean | null;
  readonly latencyMs: number | null;
  readonly error: string | null;
  readonly endpoint: string | null;
}

export interface ServicesStatusMap {
  readonly sentry: ServiceStatus;
  readonly otel: ServiceStatus;
  readonly metricsServer: ServiceStatus;
}

export interface ProbeTargets {
  readonly sentryDsn: string | undefined;
  readonly otlpEndpoint: string | undefined;
  readonly metricsUrl: string | undefined;
}

const NOT_CONFIGURED: ServiceStatus = {
  configured: false,
  reachable: null,
  latencyMs: null,
  error: null,
  endpoint: null,
};

interface ProbeResult {
  readonly reachable: boolean;
  readonly latencyMs: number;
  readonly error: string | null;
}

async function probeUrl(url: string): Promise<ProbeResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  const start = performance.now();
  try {
    await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    return { reachable: true, latencyMs: Math.round(performance.now() - start), error: null };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - start);
    if (ctrl.signal.aborted) {
      return { reachable: false, latencyMs, error: 'timeout' };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { reachable: false, latencyMs, error: message };
  } finally {
    clearTimeout(timer);
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

async function probeSentry(dsn: string | undefined): Promise<ServiceStatus> {
  if (!dsn) return NOT_CONFIGURED;
  const host = hostOf(dsn);
  if (!host) {
    return {
      configured: true,
      reachable: false,
      latencyMs: null,
      error: 'invalid DSN',
      endpoint: null,
    };
  }
  const result = await probeUrl(`https://${host}`);
  return { configured: true, ...result, endpoint: host };
}

async function probeEndpoint(url: string | undefined): Promise<ServiceStatus> {
  if (!url) return NOT_CONFIGURED;
  const result = await probeUrl(url);
  return { configured: true, ...result, endpoint: hostOf(url) ?? url };
}

export async function probeServices(targets: ProbeTargets): Promise<ServicesStatusMap> {
  const [sentry, otel, metricsServer] = await Promise.all([
    probeSentry(targets.sentryDsn),
    probeEndpoint(targets.otlpEndpoint),
    probeEndpoint(targets.metricsUrl),
  ]);
  log.debug({ sentry, otel, metricsServer }, 'services probe completed');
  return { sentry, otel, metricsServer };
}
