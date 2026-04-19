import { beforeEach, describe, expect, it } from 'vitest';
import { createMetrics, exportMetrics, startHistogramTimer } from '../metrics/index.ts';

describe('metrics registry', () => {
  let metrics: ReturnType<typeof createMetrics>;

  beforeEach(() => {
    metrics = createMetrics();
  });

  it('exports in Prometheus text format with the app default label', async () => {
    metrics.sessionActive.set(3);
    const text = await exportMetrics(metrics);
    expect(text).toContain('# TYPE g4os_session_active_count gauge');
    expect(text).toContain('g4os_session_active_count{app="g4os"} 3');
  });

  it('records IPC request histogram + counter with consistent labels', async () => {
    metrics.ipcRequestDuration
      .labels({ procedure: 'sessions.list', type: 'query', status: 'ok' })
      .observe(0.02);
    metrics.ipcRequestTotal
      .labels({ procedure: 'sessions.list', type: 'query', status: 'ok' })
      .inc();
    const text = await exportMetrics(metrics);
    expect(text).toMatch(/g4os_ipc_request_duration_seconds_bucket\{.*procedure="sessions\.list"/);
    expect(text).toMatch(/g4os_ipc_request_total\{.*procedure="sessions\.list".*\} 1/);
  });

  it('tracks agent token counters per type', async () => {
    metrics.agentTokensTotal.labels({ agent: 'claude', type: 'input' }).inc(1200);
    metrics.agentTokensTotal.labels({ agent: 'claude', type: 'output' }).inc(300);
    const text = await exportMetrics(metrics);
    expect(text).toMatch(
      /g4os_agent_tokens_total\{[^}]*agent="claude"[^}]*type="input"[^}]*\} 1200/,
    );
    expect(text).toMatch(
      /g4os_agent_tokens_total\{[^}]*agent="claude"[^}]*type="output"[^}]*\} 300/,
    );
  });

  it('startHistogramTimer observes a positive elapsed value', async () => {
    const timer = startHistogramTimer(metrics.mcpToolCallDuration, {
      tool: 'echo',
      source: 'stdio',
      status: 'ok',
    });
    const elapsed = timer.end();
    expect(elapsed).toBeGreaterThanOrEqual(0);
    const text = await exportMetrics(metrics);
    expect(text).toMatch(
      /g4os_mcp_tool_call_duration_seconds_count\{.*tool="echo",source="stdio",status="ok".*\} 1/,
    );
  });

  it('registries created separately do not share state', async () => {
    const other = createMetrics();
    metrics.sessionActive.set(5);
    other.sessionActive.set(9);
    const textA = await exportMetrics(metrics);
    const textB = await exportMetrics(other);
    expect(textA).toMatch(/g4os_session_active_count\{[^}]*\} 5/);
    expect(textB).toMatch(/g4os_session_active_count\{[^}]*\} 9/);
  });
});
