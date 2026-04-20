import { lastValueFrom, toArray } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ClaudeAgent } from '../../claude/claude-agent.ts';
import type { ClaudeProvider, ClaudeStreamEvent } from '../../claude/types.ts';
import type { AgentConfig, AgentEvent, AgentTurnInput } from '../../interface/agent.ts';

async function* iterate<T>(items: readonly T[]): AsyncIterable<T> {
  for (const item of items) {
    await Promise.resolve();
    yield item;
  }
}

function providerOf(
  events: readonly ClaudeStreamEvent[],
  kind: 'direct' | 'bedrock' | 'compat' = 'direct',
  onCall?: (signal: AbortSignal) => void,
): ClaudeProvider {
  return {
    kind,
    createMessage: (_params, ctx) => {
      onCall?.(ctx.signal);
      return Promise.resolve(iterate(events));
    },
  };
}

function buildInput(overrides: Partial<AgentTurnInput> = {}): AgentTurnInput {
  const config: AgentConfig = {
    connectionSlug: 'anthropic-direct',
    modelId: 'claude-opus-4-7',
  };
  return {
    sessionId: '00000000-0000-0000-0000-000000000001',
    turnId: 'turn-1',
    messages: [],
    config,
    ...overrides,
  };
}

describe('ClaudeAgent', () => {
  const baseConfig: AgentConfig = {
    connectionSlug: 'anthropic-direct',
    modelId: 'claude-opus-4-7',
  };

  it('kind is "claude" and capabilities reflect the model id', () => {
    const agent = new ClaudeAgent(baseConfig, providerOf([]));
    expect(agent.kind).toBe('claude');
    expect(agent.capabilities.family).toBe('anthropic');
    expect(agent.capabilities.promptCaching).toBe(true);
    agent.dispose();
  });

  it('run() emits AgentEvent stream ending with done', async () => {
    const agent = new ClaudeAgent(
      baseConfig,
      providerOf([
        { type: 'message_start', message: { id: 'm-1' } },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'hello' },
        },
        { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
        { type: 'message_stop' },
      ]),
    );

    const events: AgentEvent[] = await lastValueFrom(agent.run(buildInput()).pipe(toArray()));
    expect(events[0]).toEqual({ type: 'started', turnId: 'turn-1' });
    expect(events.find((e) => e.type === 'text_delta')).toEqual({
      type: 'text_delta',
      text: 'hello',
    });
    expect(events.at(-1)).toEqual({ type: 'done', reason: 'stop' });
    agent.dispose();
  });

  it('dispose() aborts active provider call mid-turn', async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveCreate: ((value: AsyncIterable<never>) => void) | undefined;
    const pending = new Promise<AsyncIterable<never>>((resolve) => {
      resolveCreate = resolve;
    });
    const agent = new ClaudeAgent(baseConfig, {
      kind: 'direct',
      createMessage: (_params, ctx) => {
        capturedSignal = ctx.signal;
        return pending;
      },
    });
    const firstEvent = new Promise<AgentEvent>((resolve) => {
      const sub = agent.run(buildInput()).subscribe({
        next: (event) => {
          resolve(event);
          // do NOT unsubscribe here; the outer test controls disposal
          void sub;
        },
      });
    });
    const started = await firstEvent;
    expect(started.type).toBe('started');
    expect(capturedSignal?.aborted).toBe(false);
    agent.dispose();
    expect(capturedSignal?.aborted).toBe(true);
    const empty: AsyncIterable<never> = {
      [Symbol.asyncIterator]: (): AsyncIterator<never> => ({
        next: () => Promise.resolve({ value: undefined, done: true }),
      }),
    };
    resolveCreate?.(empty);
  });

  it('interrupt(sessionId) aborts the active turn for that session', async () => {
    let captured: AbortSignal | undefined;
    let resolveCreate: ((value: AsyncIterable<never>) => void) | undefined;
    const pending = new Promise<AsyncIterable<never>>((resolve) => {
      resolveCreate = resolve;
    });
    const agent = new ClaudeAgent(baseConfig, {
      kind: 'direct',
      createMessage: (_params, ctx) => {
        captured = ctx.signal;
        return pending;
      },
    });
    const input = buildInput();
    const firstEvent = new Promise<AgentEvent>((resolve) => {
      agent.run(input).subscribe({ next: resolve });
    });
    const started = await firstEvent;
    expect(started.type).toBe('started');
    const result = await agent.interrupt(input.sessionId);
    expect(result.isOk()).toBe(true);
    expect(captured?.aborted).toBe(true);
    const empty: AsyncIterable<never> = {
      [Symbol.asyncIterator]: (): AsyncIterator<never> => ({
        next: () => Promise.resolve({ value: undefined, done: true }),
      }),
    };
    resolveCreate?.(empty);
    agent.dispose();
  });

  it('applies prompt cache 1h on direct providers with caching-capable models', async () => {
    let captured: string | undefined;
    const provider: ClaudeProvider = {
      kind: 'direct',
      createMessage: (params) => {
        const systemBlock = params.system?.[0];
        captured = systemBlock?.cache_control?.ttl;
        return Promise.resolve(iterate([{ type: 'message_stop' }]));
      },
    };
    const agent = new ClaudeAgent(baseConfig, provider);
    const input = buildInput({ config: { ...baseConfig, systemPrompt: 'you are G4' } });
    await lastValueFrom(agent.run(input).pipe(toArray()));
    expect(captured).toBe('1h');
    agent.dispose();
  });

  it('skips 1h cache upgrade on non-direct providers by default', async () => {
    let captured: string | undefined;
    const provider: ClaudeProvider = {
      kind: 'compat',
      createMessage: (params) => {
        const systemBlock = params.system?.[0];
        captured = systemBlock?.cache_control?.ttl;
        return Promise.resolve(iterate([{ type: 'message_stop' }]));
      },
    };
    const agent = new ClaudeAgent(baseConfig, provider);
    const input = buildInput({ config: { ...baseConfig, systemPrompt: 'you are G4' } });
    await lastValueFrom(agent.run(input).pipe(toArray()));
    expect(captured).toBeUndefined();
    agent.dispose();
  });
});
