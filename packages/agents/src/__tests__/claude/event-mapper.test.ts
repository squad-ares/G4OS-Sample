import { describe, expect, it } from 'vitest';
import {
  createEventMapperState,
  mapStopReason,
  mapStreamEvent,
} from '../../claude/runner/event-mapper.ts';
import type { ClaudeStreamEvent } from '../../claude/types.ts';

describe('mapStopReason', () => {
  it('maps every stop reason to AgentDoneReason', () => {
    expect(mapStopReason('end_turn')).toBe('stop');
    expect(mapStopReason('stop_sequence')).toBe('stop');
    expect(mapStopReason('max_tokens')).toBe('max_tokens');
    expect(mapStopReason('tool_use')).toBe('tool_use');
    expect(mapStopReason(undefined)).toBe('stop');
  });
});

describe('mapStreamEvent', () => {
  it('emits nothing for message_start + message_stop sentinels', () => {
    const state = createEventMapperState();
    expect(mapStreamEvent({ type: 'message_start', message: { id: 'm1' } }, state)).toEqual([]);
    expect(mapStreamEvent({ type: 'message_stop' }, state)).toEqual([]);
  });

  it('text_delta → AgentEvent text_delta', () => {
    const state = createEventMapperState();
    const out = mapStreamEvent(
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'hello' },
      },
      state,
    );
    expect(out).toEqual([{ type: 'text_delta', text: 'hello' }]);
  });

  it('thinking_delta → AgentEvent thinking_delta', () => {
    const state = createEventMapperState();
    const out = mapStreamEvent(
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'ponder' },
      },
      state,
    );
    expect(out).toEqual([{ type: 'thinking_delta', text: 'ponder' }]);
  });

  it('tool_use lifecycle produces start → input_delta (with toolUseId) → complete (parsed input)', () => {
    const state = createEventMapperState();
    const events: ClaudeStreamEvent[] = [
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'tu-1', name: 'grep', input: {} },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"q":' },
      },
      {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '"foo"}' },
      },
      { type: 'content_block_stop', index: 0 },
    ];
    const flat = events.flatMap((ev) => mapStreamEvent(ev, state));
    expect(flat).toEqual([
      { type: 'tool_use_start', toolUseId: 'tu-1', toolName: 'grep' },
      { type: 'tool_use_input_delta', toolUseId: 'tu-1', partial: '{"q":' },
      { type: 'tool_use_input_delta', toolUseId: 'tu-1', partial: '"foo"}' },
      { type: 'tool_use_complete', toolUseId: 'tu-1', input: { q: 'foo' } },
    ]);
  });

  it('parseToolInput yields {} on malformed JSON without throwing', () => {
    const state = createEventMapperState();
    const events: ClaudeStreamEvent[] = [
      {
        type: 'content_block_start',
        index: 1,
        content_block: { type: 'tool_use', id: 'tu-2', name: 'broken', input: {} },
      },
      {
        type: 'content_block_delta',
        index: 1,
        delta: { type: 'input_json_delta', partial_json: '{not:json' },
      },
      { type: 'content_block_stop', index: 1 },
    ];
    const flat = events.flatMap((ev) => mapStreamEvent(ev, state));
    expect(flat.at(-1)).toEqual({ type: 'tool_use_complete', toolUseId: 'tu-2', input: {} });
  });

  it('message_delta emits usage and done when stop_reason is present', () => {
    const state = createEventMapperState();
    const out = mapStreamEvent(
      {
        type: 'message_delta',
        delta: { stop_reason: 'max_tokens' },
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_read_input_tokens: 20,
          cache_creation_input_tokens: 10,
        },
      },
      state,
    );
    expect(out).toEqual([
      { type: 'usage', input: 100, output: 50, cacheRead: 20, cacheWrite: 10 },
      { type: 'done', reason: 'max_tokens' },
    ]);
  });

  it('text content_block_start emits nothing (text arrives via deltas)', () => {
    const state = createEventMapperState();
    const out = mapStreamEvent(
      {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      },
      state,
    );
    expect(out).toEqual([]);
  });
});
