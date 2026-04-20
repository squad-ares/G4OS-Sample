import { firstValueFrom, toArray } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { GoogleAgent } from '../../google/google-agent.ts';
import type { GeminiProvider, GeminiStreamChunk } from '../../google/types.ts';

const FAKE_SESSION_ID = '00000000-0000-0000-0000-000000000001' as const;
const FAKE_TURN_ID = 'turn-001';

function makeInput(text = 'Hello!') {
  return {
    sessionId: FAKE_SESSION_ID,
    turnId: FAKE_TURN_ID,
    messages: [
      {
        id: '00000000-0000-0000-0000-000000000002',
        sessionId: FAKE_SESSION_ID,
        role: 'user' as const,
        content: [{ type: 'text' as const, text }],
        attachments: [] as never[],
        createdAt: 1000,
        updatedAt: 1000,
        metadata: {},
      },
    ],
    config: {
      connectionSlug: 'gemini-3.1',
      modelId: 'gemini-3.1-pro-preview',
    },
  };
}

function makeProvider(chunks: GeminiStreamChunk[]): GeminiProvider {
  return {
    openStream: () =>
      Promise.resolve(
        (async function* () {
          await Promise.resolve();
          for (const chunk of chunks) yield chunk;
        })(),
      ),
    classifyTurn: async () => 'custom_tools',
  };
}

describe('GoogleAgent', () => {
  describe('run() — basic text streaming', () => {
    it('emits started, text_delta, done events', async () => {
      const provider = makeProvider([
        { type: 'text_delta', text: 'Hello' },
        { type: 'text_delta', text: ' World' },
        { type: 'done', finishReason: 'STOP' },
      ]);
      const agent = new GoogleAgent(makeInput().config, provider, {
        enableNativeRouting: false,
      });

      const events = await firstValueFrom(agent.run(makeInput()).pipe(toArray()));
      agent.dispose();

      expect(events[0]).toEqual({ type: 'started', turnId: FAKE_TURN_ID });
      expect(events.some((e) => e.type === 'text_delta' && e.text === 'Hello')).toBe(true);
      expect(events[events.length - 1]).toEqual({ type: 'done', reason: 'stop' });
    });

    it('properly sets kind and capabilities', () => {
      const agent = new GoogleAgent(makeInput().config, makeProvider([]), {
        enableNativeRouting: false,
      });
      expect(agent.kind).toBe('google');
      expect(agent.capabilities.family).toBe('google');
      expect(agent.capabilities.streaming).toBe(true);
      agent.dispose();
    });
  });

  describe('run() — classifier fallback', () => {
    it('falls back to custom_tools when classifier throws', async () => {
      const capturedStrategies: string[] = [];
      const provider: GeminiProvider = {
        openStream: (params) => {
          capturedStrategies.push(params.strategy ?? 'none');
          return Promise.resolve(
            (async function* () {
              await Promise.resolve();
              yield { type: 'done' as const, finishReason: 'STOP' as const };
            })(),
          );
        },
        classifyTurn: () => Promise.reject(new Error('classifier network error')),
      };
      const agent = new GoogleAgent(makeInput().config, provider, {});

      await firstValueFrom(agent.run(makeInput()).pipe(toArray()));
      agent.dispose();

      expect(capturedStrategies[0]).toBe('custom_tools');
    });
  });

  describe('interrupt()', () => {
    it('resolves ok when no active turn', async () => {
      const agent = new GoogleAgent(makeInput().config, makeProvider([]), {
        enableNativeRouting: false,
      });
      const result = await agent.interrupt(FAKE_SESSION_ID);
      expect(result.isOk()).toBe(true);
      agent.dispose();
    });
  });

  describe('dispose()', () => {
    it('aborts active controllers on dispose', () => {
      const provider = makeProvider([]);
      const agent = new GoogleAgent(makeInput().config, provider, {
        enableNativeRouting: false,
      });
      // Start a run to register a controller
      agent.run(makeInput()).subscribe({
        error: () => {
          /* noop */
        },
      });
      expect(() => agent.dispose()).not.toThrow();
    });
  });
});
