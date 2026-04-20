import { firstValueFrom, toArray } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { OpenAIAgent } from '../../openai/openai-agent.ts';
import type { OpenAIProvider, OpenAIStreamChunk } from '../../openai/types.ts';

const FAKE_SESSION_ID = '00000000-0000-0000-0000-000000000001' as const;
const FAKE_TURN_ID = 'turn-001';

function makeInput(text = 'Hello') {
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
      connectionSlug: 'openai',
      modelId: 'gpt-4o',
    },
  };
}

function makeProvider(chunks: OpenAIStreamChunk[]): OpenAIProvider {
  return {
    kind: 'completions',
    openStream: () =>
      Promise.resolve(
        (async function* () {
          await Promise.resolve();
          for (const chunk of chunks) yield chunk;
        })(),
      ),
  };
}

describe('OpenAIAgent', () => {
  describe('run()', () => {
    it('emits started, text_delta, done events', async () => {
      const provider = makeProvider([
        { type: 'text_delta', text: 'Hel' },
        { type: 'text_delta', text: 'lo' },
        { type: 'done', finishReason: 'stop' },
      ]);
      const agent = new OpenAIAgent(makeInput().config, provider, { connectionSlug: 'openai' });

      const events = await firstValueFrom(agent.run(makeInput()).pipe(toArray()));
      agent.dispose();

      expect(events[0]).toEqual({ type: 'started', turnId: FAKE_TURN_ID });
      expect(events.some((e) => e.type === 'text_delta' && e.text === 'Hel')).toBe(true);
      expect(events[events.length - 1]).toEqual({ type: 'done', reason: 'stop' });
    });

    it('sets correct kind based on provider', () => {
      const agentComp = new OpenAIAgent(makeInput().config, makeProvider([]), {
        connectionSlug: 'openai',
      });
      expect(agentComp.kind).toBe('openai');

      const agentResp = new OpenAIAgent(
        makeInput().config,
        { ...makeProvider([]), kind: 'responses' },
        { connectionSlug: 'openai' },
      );
      expect(agentResp.kind).toBe('openai-responses');

      agentComp.dispose();
      agentResp.dispose();
    });
  });

  describe('interrupt()', () => {
    it('resolves ok when no active turn', async () => {
      const agent = new OpenAIAgent(makeInput().config, makeProvider([]), {
        connectionSlug: 'openai',
      });
      const result = await agent.interrupt(FAKE_SESSION_ID);
      expect(result.isOk()).toBe(true);
      agent.dispose();
    });
  });

  describe('dispose()', () => {
    it('aborts active controllers on dispose', () => {
      const agent = new OpenAIAgent(makeInput().config, makeProvider([]), {
        connectionSlug: 'openai',
      });
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      agent.run(makeInput()).subscribe({
        error: () => {
          /* noop */
        },
      });
      expect(() => agent.dispose()).not.toThrow();
    });
  });
});
