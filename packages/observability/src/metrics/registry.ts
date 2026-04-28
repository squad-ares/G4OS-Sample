import { Counter, collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';

/**
 * Opções pra `createMetrics()`. Útil em testes que precisam isolar registries
 * ou desabilitar default metrics (gc, heap, event loop).
 */
export interface CreateMetricsOptions {
  /**
   * Quando `true`, registra métricas default do prom-client (`process_*`,
   * `nodejs_*`) no mesmo Registry. Default `true` em produção (visibility
   * de health do process), `false` em testes para evitar coletas
   * automáticas que poluem snapshots. CR4-17.
   */
  readonly includeDefaults?: boolean;
}

export interface G4Metrics {
  readonly registry: Registry;
  readonly ipcRequestDuration: Histogram<string>;
  readonly ipcRequestTotal: Counter<string>;
  readonly sessionActive: Gauge<string>;
  readonly agentRequestDuration: Histogram<string>;
  readonly agentTokensTotal: Counter<string>;
  readonly mcpSubprocessCount: Gauge<string>;
  readonly mcpToolCallDuration: Histogram<string>;
  readonly mcpSubprocessCrashTotal: Counter<string>;
  readonly workerMemoryRss: Gauge<string>;
  readonly workerRestartTotal: Counter<string>;
  /** TASK-OUTLIER-22 — turn-scoped métricas de alta granularidade. */
  readonly turnDurationMs: Histogram<string>;
  readonly turnTokensTotal: Counter<string>;
  readonly turnErrorsTotal: Counter<string>;
  readonly turnToolCallsTotal: Counter<string>;
  readonly turnsStartedTotal: Counter<string>;
}

const IPC_BUCKETS = [0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const AGENT_BUCKETS = [0.1, 0.5, 1, 5, 10, 30, 60, 120];
const MCP_BUCKETS = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30];
const TURN_MS_BUCKETS = [100, 500, 1_000, 2_500, 5_000, 10_000, 30_000, 60_000, 120_000];

export function createMetrics(options: CreateMetricsOptions = {}): G4Metrics {
  const registry = new Registry();
  registry.setDefaultLabels({ app: 'g4os' });
  if (options.includeDefaults !== false) {
    // CR4-17: process metrics (heap, gc, event loop) coletadas no mesmo
    // registry; aparecem em `exportMetrics()` ao lado das custom.
    collectDefaultMetrics({ register: registry, prefix: 'g4os_' });
  }

  const ipcRequestDuration = new Histogram({
    name: 'g4os_ipc_request_duration_seconds',
    help: 'Duration of IPC requests',
    labelNames: ['procedure', 'type', 'status'],
    buckets: IPC_BUCKETS,
    registers: [registry],
  });

  const ipcRequestTotal = new Counter({
    name: 'g4os_ipc_request_total',
    help: 'Total IPC requests',
    labelNames: ['procedure', 'type', 'status'],
    registers: [registry],
  });

  const sessionActive = new Gauge({
    name: 'g4os_session_active_count',
    help: 'Active session count',
    registers: [registry],
  });

  const agentRequestDuration = new Histogram({
    name: 'g4os_agent_request_duration_seconds',
    help: 'Agent request duration',
    labelNames: ['agent', 'status'],
    buckets: AGENT_BUCKETS,
    registers: [registry],
  });

  const agentTokensTotal = new Counter({
    name: 'g4os_agent_tokens_total',
    help: 'Total tokens consumed',
    labelNames: ['agent', 'type'],
    registers: [registry],
  });

  const mcpSubprocessCount = new Gauge({
    name: 'g4os_mcp_subprocess_count',
    help: 'Number of running MCP subprocesses',
    registers: [registry],
  });

  const mcpToolCallDuration = new Histogram({
    name: 'g4os_mcp_tool_call_duration_seconds',
    help: 'Tool call duration',
    labelNames: ['tool', 'source', 'status'],
    buckets: MCP_BUCKETS,
    registers: [registry],
  });

  const mcpSubprocessCrashTotal = new Counter({
    name: 'g4os_mcp_subprocess_crash_total',
    help: 'MCP subprocess crashes',
    labelNames: ['source'],
    registers: [registry],
  });

  const workerMemoryRss = new Gauge({
    name: 'g4os_worker_memory_rss_bytes',
    help: 'Worker RSS memory bytes',
    labelNames: ['session_id'],
    registers: [registry],
  });

  const workerRestartTotal = new Counter({
    name: 'g4os_worker_restart_total',
    help: 'Worker process restarts',
    labelNames: ['session_id', 'reason'],
    registers: [registry],
  });

  const turnDurationMs = new Histogram({
    name: 'g4os_turn_duration_ms',
    help: 'Turn duration from dispatch to done/error (ms)',
    labelNames: ['provider', 'status'],
    buckets: TURN_MS_BUCKETS,
    registers: [registry],
  });

  const turnTokensTotal = new Counter({
    name: 'g4os_turn_tokens_total',
    help: 'Tokens consumed per turn',
    labelNames: ['provider', 'direction'],
    registers: [registry],
  });

  const turnErrorsTotal = new Counter({
    name: 'g4os_turn_errors_total',
    help: 'Turn errors grouped by error code',
    labelNames: ['provider', 'code'],
    registers: [registry],
  });

  const turnToolCallsTotal = new Counter({
    name: 'g4os_turn_tool_calls_total',
    help: 'Tool calls dispatched during a turn',
    labelNames: ['tool_name', 'status'],
    registers: [registry],
  });

  const turnsStartedTotal = new Counter({
    name: 'g4os_turns_started_total',
    help: 'Turns started (user messages dispatched)',
    labelNames: ['provider'],
    registers: [registry],
  });

  return {
    registry,
    ipcRequestDuration,
    ipcRequestTotal,
    sessionActive,
    agentRequestDuration,
    agentTokensTotal,
    mcpSubprocessCount,
    mcpToolCallDuration,
    mcpSubprocessCrashTotal,
    workerMemoryRss,
    workerRestartTotal,
    turnDurationMs,
    turnTokensTotal,
    turnErrorsTotal,
    turnToolCallsTotal,
    turnsStartedTotal,
  };
}

let sharedMetrics: G4Metrics | undefined;

export function getMetrics(): G4Metrics {
  if (!sharedMetrics) sharedMetrics = createMetrics();
  return sharedMetrics;
}

// CR9: limpar o registry anterior antes de soltar a referência. Sem
// `registry.clear()`, métricas registradas (Counters, Histograms, Gauges)
// e o interval do `collectDefaultMetrics` permanecem coletando heap/gc/
// event-loop em background — vazamento memory + pollution em snapshots
// de teste subsequentes que chamam `getMetrics()` de novo.
export function resetMetrics(): void {
  sharedMetrics?.registry.clear();
  sharedMetrics = undefined;
}

export function exportMetrics(metrics: G4Metrics = getMetrics()): Promise<string> {
  return metrics.registry.metrics();
}

export function exportContentType(metrics: G4Metrics = getMetrics()): string {
  return metrics.registry.contentType;
}
