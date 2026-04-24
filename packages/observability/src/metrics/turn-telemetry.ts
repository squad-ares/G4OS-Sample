/**
 * TurnTelemetry — wrapper ergonômico para instrumentar TurnDispatcher sem
 * espalhar `metrics.*.labels(...)` pelo código. Uso:
 *
 *   const telemetry = createTurnTelemetry({ provider: 'anthropic-direct' });
 *   telemetry.onStart();
 *   // ...stream events...
 *   telemetry.onUsage({ input: 10, output: 50 });
 *   telemetry.onToolCall('read_file', 'ok');
 *   telemetry.onDone('stop');
 *   // or: telemetry.onError('agent.stream_error');
 */

import { type G4Metrics, getMetrics } from './registry.ts';

export interface TurnTelemetry {
  onStart(): void;
  onUsage(usage: { input: number; output: number }): void;
  onToolCall(toolName: string, status: 'ok' | 'error'): void;
  onDone(reason: string): void;
  onError(code: string): void;
}

export interface TurnTelemetryDeps {
  readonly provider: string;
  readonly metrics?: G4Metrics;
  readonly now?: () => number;
}

export function createTurnTelemetry(deps: TurnTelemetryDeps): TurnTelemetry {
  const metrics = deps.metrics ?? getMetrics();
  const now = deps.now ?? (() => performance.now());
  const provider = deps.provider;
  let startedAt: number | null = null;
  let settled = false;

  const observe = (status: string) => {
    if (startedAt === null || settled) return;
    settled = true;
    const elapsed = Math.max(0, now() - startedAt);
    metrics.turnDurationMs.labels({ provider, status }).observe(elapsed);
  };

  return {
    onStart() {
      startedAt = now();
      settled = false;
      metrics.turnsStartedTotal.labels({ provider }).inc();
    },
    onUsage(usage) {
      if (usage.input > 0) {
        metrics.turnTokensTotal.labels({ provider, direction: 'input' }).inc(usage.input);
      }
      if (usage.output > 0) {
        metrics.turnTokensTotal.labels({ provider, direction: 'output' }).inc(usage.output);
      }
    },
    onToolCall(toolName, status) {
      metrics.turnToolCallsTotal.labels({ tool_name: toolName, status }).inc();
    },
    onDone(reason) {
      observe(reason);
    },
    onError(code) {
      metrics.turnErrorsTotal.labels({ provider, code }).inc();
      observe('error');
    },
  };
}
