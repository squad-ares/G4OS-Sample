import { describe, expect, it } from 'vitest';

describe('supportsOpenAIConnection via OpenAI factory', () => {
  it('accepts openai slug prefixes', async () => {
    const { supportsOpenAIConnection } = await import('../../openai/factory.ts');
    expect(supportsOpenAIConnection('openai')).toBe(true);
    expect(supportsOpenAIConnection('openai-compat')).toBe(true);
    expect(supportsOpenAIConnection('pi_openai')).toBe(true);
  });

  it('rejects unrelated slugs', async () => {
    const { supportsOpenAIConnection } = await import('../../openai/factory.ts');
    expect(supportsOpenAIConnection('google')).toBe(false);
    expect(supportsOpenAIConnection('claude')).toBe(false);
    expect(supportsOpenAIConnection('codex')).toBe(false);
  });
});

describe('createOpenAIFactory', () => {
  it('creates an OpenAIAgent with the correct kind', async () => {
    const { createOpenAIFactory } = await import('../../openai/factory.ts');
    const { OpenAIAgent } = await import('../../openai/openai-agent.ts');

    const factory = createOpenAIFactory({
      resolveApiKey: () => 'test-key',
      providerOverride: {
        kind: 'completions',
        openStream: () =>
          Promise.resolve(
            (async function* () {
              await Promise.resolve();
              yield { type: 'done' as const, finishReason: 'stop' as const };
            })(),
          ),
      },
    });

    expect(factory.kind).toBe('openai');
    expect(factory.supports({ connectionSlug: 'openai', modelId: 'gpt-4o' })).toBe(true);

    const agent = factory.create({ connectionSlug: 'openai', modelId: 'gpt-4o' });
    expect(agent).toBeInstanceOf(OpenAIAgent);
    expect(agent.kind).toBe('openai');
    agent.dispose();
  });

  it('responses provider returns kind openai-responses', async () => {
    const { createOpenAIFactory } = await import('../../openai/factory.ts');

    const factory = createOpenAIFactory({
      resolveApiKey: () => 'test-key',
      resolveProtocol: () => 'responses',
      providerOverride: {
        kind: 'responses',
        openStream: () =>
          Promise.resolve(
            (async function* () {
              await Promise.resolve();
              yield { type: 'done' as const, finishReason: 'stop' as const };
            })(),
          ),
      },
    });

    const agent = factory.create({ connectionSlug: 'openai', modelId: 'gpt-4o' });
    expect(agent.kind).toBe('openai-responses');
    agent.dispose();
  });
});
