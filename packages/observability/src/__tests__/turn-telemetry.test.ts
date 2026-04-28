import { beforeEach, describe, expect, it } from 'vitest';
import { createMetrics, createTurnTelemetry, exportMetrics } from '../metrics/index.ts';

describe('createTurnTelemetry', () => {
  let metrics: ReturnType<typeof createMetrics>;
  let clock: number;
  const now = () => clock;

  beforeEach(() => {
    metrics = createMetrics({ includeDefaults: false });
    clock = 0;
  });

  it('incrementa turnsStartedTotal no onStart', async () => {
    const telemetry = createTurnTelemetry({
      provider: 'anthropic-direct',
      metrics,
      now,
    });
    telemetry.onStart();
    const text = await exportMetrics(metrics);
    expect(text).toMatch(/g4os_turns_started_total\{.*provider="anthropic-direct".*\} 1/);
  });

  it('observa duração no onDone', async () => {
    const telemetry = createTurnTelemetry({
      provider: 'anthropic-direct',
      metrics,
      now,
    });
    telemetry.onStart();
    clock = 1_500;
    telemetry.onDone('stop');

    const text = await exportMetrics(metrics);
    expect(text).toMatch(
      /g4os_turn_duration_ms_bucket\{.*provider="anthropic-direct".*status="stop".*\}/,
    );
  });

  it('registra tokens input e output separados', async () => {
    const telemetry = createTurnTelemetry({
      provider: 'openai-direct',
      metrics,
      now,
    });
    telemetry.onStart();
    telemetry.onUsage({ input: 42, output: 17 });

    const text = await exportMetrics(metrics);
    expect(text).toMatch(
      /g4os_turn_tokens_total\{.*provider="openai-direct".*direction="input".*\} 42/,
    );
    expect(text).toMatch(
      /g4os_turn_tokens_total\{.*provider="openai-direct".*direction="output".*\} 17/,
    );
  });

  it('incrementa turnErrorsTotal + observa duração com status=error no onError', async () => {
    const telemetry = createTurnTelemetry({ provider: 'claude', metrics, now });
    telemetry.onStart();
    clock = 500;
    telemetry.onError('agent.stream_error');

    const text = await exportMetrics(metrics);
    expect(text).toMatch(
      /g4os_turn_errors_total\{.*provider="claude".*code="agent.stream_error".*\} 1/,
    );
    expect(text).toMatch(/g4os_turn_duration_ms_bucket\{.*status="error".*\}/);
  });

  it('não duplica observação se onDone/onError chamados múltiplas vezes', async () => {
    const telemetry = createTurnTelemetry({ provider: 'claude', metrics, now });
    telemetry.onStart();
    clock = 1_000;
    telemetry.onDone('stop');
    telemetry.onDone('stop');
    telemetry.onError('late.error');

    const text = await exportMetrics(metrics);
    // Duração conta apenas 1x (sum aparece 1000 a primeira e única vez)
    expect(text).toMatch(/g4os_turn_duration_ms_sum\{.*provider="claude".*status="stop".*\} 1000/);
    // Error code ainda é incrementado (counter é independente)
    expect(text).toMatch(/g4os_turn_errors_total\{.*code="late.error".*\} 1/);
  });

  it('registra tool call com label status', async () => {
    const telemetry = createTurnTelemetry({ provider: 'claude', metrics, now });
    telemetry.onStart();
    telemetry.onToolCall('read_file', 'ok');
    telemetry.onToolCall('write_file', 'error');

    const text = await exportMetrics(metrics);
    expect(text).toMatch(/g4os_turn_tool_calls_total\{.*tool_name="read_file".*status="ok".*\} 1/);
    expect(text).toMatch(
      /g4os_turn_tool_calls_total\{.*tool_name="write_file".*status="error".*\} 1/,
    );
  });
});
