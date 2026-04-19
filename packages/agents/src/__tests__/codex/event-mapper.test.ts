import { describe, expect, it } from 'vitest';
import { mapCodexEvent, mapCodexStopReason } from '../../codex/app-server/event-mapper.ts';
import type { CodexResponseEvent } from '../../codex/app-server/protocol.ts';

describe('mapCodexStopReason', () => {
  it('maps each wire reason to AgentDoneReason', () => {
    expect(mapCodexStopReason('stop')).toBe('stop');
    expect(mapCodexStopReason('max_tokens')).toBe('max_tokens');
    expect(mapCodexStopReason('tool_use')).toBe('tool_use');
    expect(mapCodexStopReason('interrupted')).toBe('interrupted');
    expect(mapCodexStopReason('error')).toBe('error');
  });
});

describe('mapCodexEvent', () => {
  const requestId = 'r-1';

  it('ack emits nothing', () => {
    expect(mapCodexEvent({ type: 'ack', requestId })).toBeUndefined();
  });

  it('turn_started → started with turnId', () => {
    expect(mapCodexEvent({ type: 'turn_started', requestId, turnId: 't-1' })).toEqual({
      type: 'started',
      turnId: 't-1',
    });
  });

  it('text_delta / thinking_delta forwarded', () => {
    expect(mapCodexEvent({ type: 'text_delta', requestId, text: 'hi' })).toEqual({
      type: 'text_delta',
      text: 'hi',
    });
    expect(mapCodexEvent({ type: 'thinking_delta', requestId, text: 'pondering' })).toEqual({
      type: 'thinking_delta',
      text: 'pondering',
    });
  });

  it('tool_use lifecycle translates wire ids to AgentEvent', () => {
    expect(
      mapCodexEvent({
        type: 'tool_use_start',
        requestId,
        toolUseId: 'tu-1',
        toolName: 'grep',
      }),
    ).toEqual({ type: 'tool_use_start', toolUseId: 'tu-1', toolName: 'grep' });

    expect(
      mapCodexEvent({
        type: 'tool_use_input_delta',
        requestId,
        toolUseId: 'tu-1',
        partial: '{"q":',
      }),
    ).toEqual({ type: 'tool_use_input_delta', toolUseId: 'tu-1', partial: '{"q":' });

    expect(
      mapCodexEvent({
        type: 'tool_use_complete',
        requestId,
        toolUseId: 'tu-1',
        input: { q: 'foo' },
      }),
    ).toEqual({ type: 'tool_use_complete', toolUseId: 'tu-1', input: { q: 'foo' } });
  });

  it('usage forwards both mandatory and optional cache fields', () => {
    expect(
      mapCodexEvent({
        type: 'usage',
        requestId,
        inputTokens: 500,
        outputTokens: 200,
        cacheReadTokens: 300,
      }),
    ).toEqual({ type: 'usage', input: 500, output: 200, cacheRead: 300 });
    expect(
      mapCodexEvent({
        type: 'usage',
        requestId,
        inputTokens: 100,
        outputTokens: 50,
      }),
    ).toEqual({ type: 'usage', input: 100, output: 50 });
  });

  it('turn_finished → done with mapped reason', () => {
    expect(mapCodexEvent({ type: 'turn_finished', requestId, stopReason: 'max_tokens' })).toEqual({
      type: 'done',
      reason: 'max_tokens',
    });
  });

  it('error events are handled by the agent path, not the mapper', () => {
    const event: CodexResponseEvent = {
      type: 'error',
      requestId,
      code: 'rate_limited',
      message: 'slow down',
    };
    expect(mapCodexEvent(event)).toBeUndefined();
  });
});
