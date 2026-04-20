import { AgentError } from '@g4os/kernel/errors';
import { describe, expect, it } from 'vitest';
import type { AgentEvent, AgentEventType } from '../interface/agent.ts';
import { AgentConfigSchema, AgentDoneReasonSchema } from '../interface/schemas.ts';

function renderEvent(event: AgentEvent): string {
  switch (event.type) {
    case 'started':
      return `started:${event.turnId}`;
    case 'text_delta':
      return `text:${event.text}`;
    case 'thinking_delta':
      return `thinking:${event.text}`;
    case 'tool_use_start':
      return `tool_start:${event.toolUseId}:${event.toolName}`;
    case 'tool_use_input_delta':
      return `tool_input:${event.toolUseId}:${event.partial.length}`;
    case 'tool_use_complete':
      return `tool_complete:${event.toolUseId}:${Object.keys(event.input).length}`;
    case 'tool_result':
      return `tool_result:${event.toolUseId}:${event.isError ? 'err' : 'ok'}`;
    case 'usage':
      return `usage:${event.input}:${event.output}`;
    case 'done':
      return `done:${event.reason}`;
    case 'error':
      return `error:${event.error.code}`;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}

describe('AgentEvent union', () => {
  it('covers every event shape v1 emits (exhaustive switch stays type-safe)', () => {
    const events: AgentEvent[] = [
      { type: 'started', turnId: 't-1' },
      { type: 'text_delta', text: 'hi' },
      { type: 'thinking_delta', text: 'pondering' },
      { type: 'tool_use_start', toolUseId: 'tu-1', toolName: 'grep' },
      { type: 'tool_use_input_delta', toolUseId: 'tu-1', partial: '{"q":' },
      { type: 'tool_use_complete', toolUseId: 'tu-1', input: { q: 'foo' } },
      { type: 'tool_result', toolUseId: 'tu-1', result: { matches: 3 }, isError: false },
      { type: 'usage', input: 1_200, output: 300, cacheRead: 900 },
      { type: 'done', reason: 'stop' },
      { type: 'error', error: AgentError.network('claude') },
    ];

    const rendered = events.map(renderEvent);
    expect(rendered).toHaveLength(10);
    expect(rendered[0]).toBe('started:t-1');
    expect(rendered[9]).toBe('error:agent.network');
  });

  it('type union covers every AgentEventType', () => {
    const coveredTypes: AgentEventType[] = [
      'started',
      'text_delta',
      'thinking_delta',
      'tool_use_start',
      'tool_use_input_delta',
      'tool_use_complete',
      'tool_result',
      'usage',
      'done',
      'error',
    ];
    expect(new Set(coveredTypes).size).toBe(coveredTypes.length);
  });
});

describe('schemas', () => {
  it('AgentConfigSchema validates a minimal config', () => {
    const parsed = AgentConfigSchema.parse({
      connectionSlug: 'anthropic-direct',
      modelId: 'claude-opus-4-7',
    });
    expect(parsed.connectionSlug).toBe('anthropic-direct');
  });

  it('AgentConfigSchema rejects empty slug + invalid temperature', () => {
    expect(() => AgentConfigSchema.parse({ connectionSlug: '', modelId: 'x' })).toThrow();
    expect(() =>
      AgentConfigSchema.parse({ connectionSlug: 'a', modelId: 'x', temperature: 3 }),
    ).toThrow();
  });

  it('AgentDoneReasonSchema enumerates the union', () => {
    for (const reason of ['stop', 'max_tokens', 'tool_use', 'interrupted', 'error']) {
      expect(AgentDoneReasonSchema.parse(reason)).toBe(reason);
    }
    expect(() => AgentDoneReasonSchema.parse('unknown')).toThrow();
  });
});
