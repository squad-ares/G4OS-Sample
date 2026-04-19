import { describe, expect, it } from 'vitest';
import { StreamRunner } from '../../claude/runner/stream-runner.ts';
import type { ClaudeProvider, ClaudeStreamEvent } from '../../claude/types.ts';
import type { AgentEvent, AgentTurnInput } from '../../interface/agent.ts';

function fakeInput(): AgentTurnInput {
  return {
    sessionId: '00000000-0000-0000-0000-000000000001',
    turnId: 'turn-1',
    messages: [],
    config: { connectionSlug: 'anthropic-direct', modelId: 'claude-opus-4-7' },
  };
}

async function* asAsync<T>(items: readonly T[], signal?: AbortSignal): AsyncIterable<T> {
  for (const item of items) {
    await Promise.resolve();
    if (signal?.aborted) return;
    yield item;
  }
}

function providerOf(
  events: readonly ClaudeStreamEvent[] | (() => AsyncIterable<ClaudeStreamEvent>),
  kind: 'direct' | 'bedrock' | 'compat' = 'direct',
): ClaudeProvider {
  return {
    kind,
    createMessage: (_params, _ctx) =>
      Promise.resolve(typeof events === 'function' ? events() : asAsync(events)),
  };
}

async function collect(runner: StreamRunner, signal: AbortSignal): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const event of runner.run(fakeInput(), signal)) out.push(event);
  return out;
}

describe('StreamRunner', () => {
  it('emits started → mapped events → done:stop on clean stream', async () => {
    const runner = new StreamRunner({
      provider: providerOf([
        { type: 'message_start', message: { id: 'm1' } },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'hi' },
        },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
        { type: 'message_stop' },
      ]),
      buildParams: () => ({
        model: 'claude-opus-4-7',
        max_tokens: 1024,
        stream: true,
        messages: [],
      }),
    });
    const events = await collect(runner, new AbortController().signal);
    const types = events.map((e) => e.type);
    expect(types).toEqual(['started', 'text_delta', 'done']);
    const last = events.at(-1);
    if (last?.type === 'done') expect(last.reason).toBe('stop');
  });

  it('emits done:stop when provider completes without stop_reason', async () => {
    const runner = new StreamRunner({
      provider: providerOf([
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'x' },
        },
      ]),
      buildParams: () => ({ model: 'x', max_tokens: 1, stream: true, messages: [] }),
    });
    const events = await collect(runner, new AbortController().signal);
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'stop' });
  });

  it('respects abort signal mid-stream by emitting done:interrupted', async () => {
    const controller = new AbortController();
    async function* slow(): AsyncIterable<ClaudeStreamEvent> {
      await Promise.resolve();
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'a' },
      };
      controller.abort();
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'b' },
      };
    }
    const runner = new StreamRunner({
      provider: providerOf(slow),
      buildParams: () => ({ model: 'x', max_tokens: 1, stream: true, messages: [] }),
    });
    const events = await collect(runner, controller.signal);
    const types = events.map((e) => e.type);
    expect(types).toContain('text_delta');
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'interrupted' });
  });

  it('emits error + done:error when provider rejects', async () => {
    const runner = new StreamRunner(
      {
        provider: {
          kind: 'direct',
          createMessage: () => Promise.reject(new Error('boom')),
        },
        buildParams: () => ({ model: 'x', max_tokens: 1, stream: true, messages: [] }),
      },
      { providerKind: 'direct' },
    );
    const events = await collect(runner, new AbortController().signal);
    expect(events.find((e) => e.type === 'error')).toBeDefined();
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'error' });
  });
});
