import { describe, expect, it } from 'vitest';
import { createGoogleFactory, supportsGoogleConnection } from '../../google/factory.ts';
import { GoogleAgent } from '../../google/google-agent.ts';
import type { GoogleGenAISdkLike } from '../../google/providers/genai-provider.ts';

describe('supportsGoogleConnection', () => {
  it('accepts google/gemini/pi_google/pi_gemini prefixes', () => {
    expect(supportsGoogleConnection('google')).toBe(true);
    expect(supportsGoogleConnection('gemini-3.1-pro')).toBe(true);
    expect(supportsGoogleConnection('pi_google')).toBe(true);
    expect(supportsGoogleConnection('pi_gemini')).toBe(true);
  });

  it('rejects unrelated slugs', () => {
    expect(supportsGoogleConnection('openai')).toBe(false);
    expect(supportsGoogleConnection('claude')).toBe(false);
    expect(supportsGoogleConnection('codex')).toBe(false);
  });
});

describe('createGoogleFactory', () => {
  const stubSdk: GoogleGenAISdkLike = {
    generateContentStream() {
      return Promise.resolve(
        (async function* () {
          await Promise.resolve();
          yield {
            candidates: [
              {
                content: { parts: [{ text: 'hello' }] },
                finishReason: 'STOP',
              },
            ],
          };
        })(),
      );
    },
    generateContent() {
      return Promise.resolve({ text: '{"strategy":"custom_tools"}' });
    },
  };

  it('factory.kind is "google" and supports() uses the prefix check', () => {
    const factory = createGoogleFactory({
      resolveApiKey: () => 'test-key',
      sdkFactory: async () => stubSdk,
    });
    expect(factory.kind).toBe('google');
    expect(
      factory.supports({
        connectionSlug: 'gemini-3.1',
        modelId: 'gemini-3.1-pro',
        thinkingLevel: undefined,
      }),
    ).toBe(true);
    expect(
      factory.supports({ connectionSlug: 'openai', modelId: 'gpt-4o', thinkingLevel: undefined }),
    ).toBe(false);
  });

  it('create() returns a GoogleAgent with google kind', () => {
    const factory = createGoogleFactory({
      resolveApiKey: () => 'test-key',
      enableNativeRouting: false,
      sdkFactory: async () => stubSdk,
    });
    const agent = factory.create({
      connectionSlug: 'gemini-3.1',
      modelId: 'gemini-3.1-pro-preview',
    });
    expect(agent).toBeInstanceOf(GoogleAgent);
    expect(agent.kind).toBe('google');
    expect(agent.capabilities.family).toBe('google');
    agent.dispose();
  });
});
