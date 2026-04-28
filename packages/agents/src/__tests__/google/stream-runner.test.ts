import { describe, expect, it } from 'vitest';
import { StreamRunner } from '../../google/runner/stream-runner.ts';
import type { GeminiProvider, GeminiStreamParams } from '../../google/types.ts';
import type { AgentConfig, AgentTurnInput } from '../../interface/agent.ts';

const FAKE_SESSION_ID = '00000000-0000-0000-0000-000000000001' as const;

function makeInput(config: Partial<AgentConfig> = {}): AgentTurnInput {
  return {
    turnId: 'turn-001',
    sessionId: FAKE_SESSION_ID,
    messages: [],
    config: {
      connectionSlug: 'google',
      modelId: 'gemini-2.0-flash',
      ...config,
    },
  };
}

describe('google/runner/stream-runner', () => {
  it('yields started and delegates to provider stream', async () => {
    const provider: GeminiProvider = {
      openStream: () =>
        Promise.resolve(
          (async function* () {
            await Promise.resolve();
            yield { type: 'text_delta' as const, text: 'hi' };
          })(),
        ),
      classifyTurn: async () => 'custom_tools',
    };
    const runner = new StreamRunner(provider);

    const events = [];
    const abort = new AbortController();
    for await (const event of runner.run(makeInput(), 'custom_tools', abort.signal)) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: 'started', turnId: 'turn-001' });
    expect(events).toContainEqual({ type: 'text_delta', text: 'hi' });
    expect(events[events.length - 1]).toEqual({ type: 'done', reason: 'stop' });
  });

  it('injects native search tool when strategy is native_search', async () => {
    let capturedParams: GeminiStreamParams | undefined;
    const provider: GeminiProvider = {
      openStream: (params) => {
        capturedParams = params;
        return Promise.resolve(
          // biome-ignore lint/correctness/useYield: mock generator
          (async function* () {
            await Promise.resolve();
          })(),
        );
      },
      classifyTurn: async () => 'custom_tools',
    };
    const runner = new StreamRunner(provider);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of runner.run(makeInput(), 'native_search', new AbortController().signal)) {
      // drain
    }

    expect(capturedParams?.tools).toEqual([{ googleSearch: {} }]);
  });

  it('catches and yields AgentError on provider failure', async () => {
    const provider: GeminiProvider = {
      openStream: () => Promise.reject(new Error('Network failure')),
      classifyTurn: async () => 'custom_tools',
    };
    const runner = new StreamRunner(provider);

    const events = [];
    for await (const event of runner.run(
      makeInput(),
      'custom_tools',
      new AbortController().signal,
    )) {
      events.push(event);
    }

    const errEvent = events.find((e) => e.type === 'error') as Extract<
      (typeof events)[0],
      { type: 'error' }
    >;
    expect(errEvent.error).toBeDefined();
    expect(errEvent.error.message).toContain('google');
    expect((errEvent.error.cause as Error).message).toContain('Network failure');
    expect(events[events.length - 1]).toEqual({ type: 'done', reason: 'error' });
  });

  it('emits interrupted done if signal already aborted before openStream (CR9)', async () => {
    // CR9: pre-await signal check no consumeStream — abort antes do
    // openStream NÃO emite error, retorna done(reason: 'interrupted')
    // direto. Alinha com OpenAI/Claude stream-runners.
    const provider: GeminiProvider = {
      openStream: () =>
        Promise.resolve(
          (async function* () {
            await new Promise((r) => setTimeout(r, 10));
            throw new Error('should not reach here');
          })(),
        ),
      classifyTurn: async () => 'custom_tools',
    };
    const runner = new StreamRunner(provider);
    const ac = new AbortController();
    ac.abort();

    const events = [];
    for await (const event of runner.run(makeInput(), 'custom_tools', ac.signal)) {
      events.push(event);
    }

    // Não há error event — abort pré-stream é interrupted, não erro.
    expect(events.find((e) => e.type === 'error')).toBeUndefined();
    expect(events[events.length - 1]).toEqual({ type: 'done', reason: 'interrupted' });
  });
});
