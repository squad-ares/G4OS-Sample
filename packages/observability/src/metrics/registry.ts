import { Counter, Gauge, Histogram, Registry } from 'prom-client';

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
}

const IPC_BUCKETS = [0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
const AGENT_BUCKETS = [0.1, 0.5, 1, 5, 10, 30, 60, 120];
const MCP_BUCKETS = [0.01, 0.05, 0.1, 0.5, 1, 5, 10, 30];

export function createMetrics(): G4Metrics {
  const registry = new Registry();
  registry.setDefaultLabels({ app: 'g4os' });

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
  };
}

let sharedMetrics: G4Metrics | undefined;

export function getMetrics(): G4Metrics {
  if (!sharedMetrics) sharedMetrics = createMetrics();
  return sharedMetrics;
}

export function resetMetrics(): void {
  sharedMetrics = undefined;
}

export function exportMetrics(metrics: G4Metrics = getMetrics()): Promise<string> {
  return metrics.registry.metrics();
}

export function exportContentType(metrics: G4Metrics = getMetrics()): string {
  return metrics.registry.contentType;
}
