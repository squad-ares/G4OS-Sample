import { describe, expect, it } from 'vitest';
import { mapGeminiChunk } from '../../google/event-mapper/event-mapper.ts';

describe('mapGeminiChunk', () => {
  it('maps text_delta', () => {
    const events = mapGeminiChunk({ type: 'text_delta', text: 'hello' });
    expect(events).toEqual([{ type: 'text_delta', text: 'hello' }]);
  });

  it('maps thinking_delta', () => {
    const events = mapGeminiChunk({ type: 'thinking_delta', text: 'thought' });
    expect(events).toEqual([{ type: 'thinking_delta', text: 'thought' }]);
  });

  it('maps tool_call to start + complete pair', () => {
    const events = mapGeminiChunk({
      type: 'tool_call',
      id: 'call_1',
      name: 'g4_read_file',
      args: { path: '/tmp/foo' },
    });
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('tool_use_start');
    expect(events[1]?.type).toBe('tool_use_complete');
    const complete = events[1] as { input: Record<string, unknown> };
    expect(complete.input).toEqual({ path: '/tmp/foo' });
  });

  it('maps usage', () => {
    const events = mapGeminiChunk({ type: 'usage', input: 100, output: 50 });
    expect(events).toEqual([{ type: 'usage', input: 100, output: 50 }]);
  });

  it('maps done STOP to stop reason', () => {
    const events = mapGeminiChunk({ type: 'done', finishReason: 'STOP' });
    expect(events).toEqual([{ type: 'done', reason: 'stop' }]);
  });

  it('maps done MAX_TOKENS to max_tokens reason', () => {
    const events = mapGeminiChunk({ type: 'done', finishReason: 'MAX_TOKENS' });
    expect(events).toEqual([{ type: 'done', reason: 'max_tokens' }]);
  });
});
