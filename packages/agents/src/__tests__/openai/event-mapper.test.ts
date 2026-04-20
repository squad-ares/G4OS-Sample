import { describe, expect, it } from 'vitest';
import { OpenAIEventMapper } from '../../openai/event-mapper/event-mapper.ts';
import type { OpenAIStreamChunk } from '../../openai/types.ts';

describe('OpenAIEventMapper', () => {
  it('maps text_delta chunk', () => {
    const mapper = new OpenAIEventMapper();
    const events = mapper.mapChunk({ type: 'text_delta', text: 'hello' });
    expect(events).toEqual([{ type: 'text_delta', text: 'hello' }]);
  });

  it('maps reasoning_delta to thinking_delta', () => {
    const mapper = new OpenAIEventMapper();
    const events = mapper.mapChunk({ type: 'reasoning_delta', text: 'thinking...' });
    expect(events).toEqual([{ type: 'thinking_delta', text: 'thinking...' }]);
  });

  it('maps usage chunk', () => {
    const mapper = new OpenAIEventMapper();
    const chunk: OpenAIStreamChunk = { type: 'usage', input: 100, output: 50 };
    const events = mapper.mapChunk(chunk);
    expect(events).toEqual([{ type: 'usage', input: 100, output: 50 }]);
  });

  it('maps usage chunk with cacheRead', () => {
    const mapper = new OpenAIEventMapper();
    const chunk: OpenAIStreamChunk = { type: 'usage', input: 100, output: 50, cacheRead: 80 };
    const events = mapper.mapChunk(chunk);
    expect(events).toEqual([{ type: 'usage', input: 100, output: 50, cacheRead: 80 }]);
  });

  describe('tool call lifecycle', () => {
    it('emits tool_use_start when id and name first appear', () => {
      const mapper = new OpenAIEventMapper();
      const events = mapper.mapChunk({
        type: 'tool_call_delta',
        index: 0,
        id: 'call_1',
        name: 'read_file',
      });
      expect(events).toContainEqual({
        type: 'tool_use_start',
        toolUseId: 'call_1',
        toolName: 'read_file',
      });
    });

    it('accumulates argument chunks', () => {
      const mapper = new OpenAIEventMapper();
      mapper.mapChunk({ type: 'tool_call_delta', index: 0, id: 'call_1', name: 'bash' });
      const events = mapper.mapChunk({
        type: 'tool_call_delta',
        index: 0,
        id: 'call_1',
        argumentsChunk: '{"cmd"',
      });
      expect(events).toContainEqual({
        type: 'tool_use_input_delta',
        toolUseId: 'call_1',
        partial: '{"cmd"',
      });
    });

    it('emits tool_use_complete on done with finalized JSON', () => {
      const mapper = new OpenAIEventMapper();
      mapper.mapChunk({ type: 'tool_call_delta', index: 0, id: 'call_1', name: 'read_file' });
      mapper.mapChunk({
        type: 'tool_call_delta',
        index: 0,
        id: 'call_1',
        argumentsChunk: '{"path":"/tmp"}',
      });
      const doneEvents = mapper.mapChunk({ type: 'done', finishReason: 'tool_calls' });
      const complete = doneEvents.find((e) => e.type === 'tool_use_complete');
      expect(complete).toBeDefined();
      if (complete?.type === 'tool_use_complete') {
        expect(complete.toolUseId).toBe('call_1');
        expect(complete.input).toEqual({ path: '/tmp' });
      }
    });

    it('emits done event after tool_use_complete', () => {
      const mapper = new OpenAIEventMapper();
      mapper.mapChunk({ type: 'tool_call_delta', index: 0, id: 'call_1', name: 'bash' });
      mapper.mapChunk({ type: 'tool_call_delta', index: 0, id: 'call_1', argumentsChunk: '{}' });
      const doneEvents = mapper.mapChunk({ type: 'done', finishReason: 'tool_calls' });
      const done = doneEvents.find((e) => e.type === 'done');
      expect(done).toEqual({ type: 'done', reason: 'tool_use' });
    });
  });

  describe('done reason mapping', () => {
    it('maps stop → stop', () => {
      const mapper = new OpenAIEventMapper();
      const events = mapper.mapChunk({ type: 'done', finishReason: 'stop' });
      expect(events).toContainEqual({ type: 'done', reason: 'stop' });
    });

    it('maps length → max_tokens', () => {
      const mapper = new OpenAIEventMapper();
      const events = mapper.mapChunk({ type: 'done', finishReason: 'length' });
      expect(events).toContainEqual({ type: 'done', reason: 'max_tokens' });
    });

    it('maps content_filter → stop', () => {
      const mapper = new OpenAIEventMapper();
      const events = mapper.mapChunk({ type: 'done', finishReason: 'content_filter' });
      expect(events).toContainEqual({ type: 'done', reason: 'stop' });
    });
  });
});
