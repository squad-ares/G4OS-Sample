import { describe, expect, it } from 'vitest';
import type { AgentConfig, AgentTurnInput } from '../../interface/agent.ts';
import { StreamRunner } from '../../openai/runner/stream-runner.ts';
import type { OpenAIProvider } from '../../openai/types.ts';

const FAKE_SESSION_ID = '00000000-0000-0000-0000-000000000001' as const;

function makeInput(config: Partial<AgentConfig> = {}): AgentTurnInput {
  return {
    turnId: 'turn-001',
    sessionId: FAKE_SESSION_ID,
    messages: [],
    config: {
      connectionSlug: 'openai',
      modelId: 'gpt-4o',
      ...config,
    },
  };
}

describe('openai/runner/stream-runner', () => {
  it('yields started and delegates to provider stream', async () => {
    const provider: OpenAIProvider = {
      kind: 'completions',
      openStream: () =>
        Promise.resolve(
          (async function* () {
            await Promise.resolve();
            yield { type: 'text_delta' as const, text: 'hi' };
            yield { type: 'done' as const, finishReason: 'stop' as const };
          })(),
        ),
    };
    const runner = new StreamRunner({
      provider,
      buildParams: () => ({ model: 'gpt-4o', stream: true, messages: [] }),
    });

    const events = [];
    const abort = new AbortController();
    for await (const event of runner.run(makeInput(), abort.signal)) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: 'started', turnId: 'turn-001' });
    expect(events).toContainEqual({ type: 'text_delta', text: 'hi' });
    expect(events[events.length - 1]).toEqual({ type: 'done', reason: 'stop' });
  });

  it('catches and yields AgentError on provider failure', async () => {
    const provider: OpenAIProvider = {
      kind: 'completions',
      openStream: () => Promise.reject(new Error('Network failure')),
    };
    const runner = new StreamRunner({
      provider,
      buildParams: () => ({ model: 'gpt-4o', stream: true, messages: [] }),
    });

    const events = [];
    for await (const event of runner.run(makeInput(), new AbortController().signal)) {
      events.push(event);
    }

    const errEvent = events.find((e) => e.type === 'error') as Extract<
      (typeof events)[0],
      { type: 'error' }
    >;
    expect(errEvent.error).toBeDefined();
    expect(errEvent.error.message).toContain('openai');
    expect((errEvent.error.cause as Error).message).toContain('Network failure');
    expect(events[events.length - 1]).toEqual({ type: 'done', reason: 'error' });
  });
});
