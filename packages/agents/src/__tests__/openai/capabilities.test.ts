import { describe, expect, it } from 'vitest';
import { detectCapabilities } from '../../openai/capabilities.ts';

describe('detectCapabilities', () => {
  it('returns correct config for gpt-4o models', () => {
    const caps = detectCapabilities('gpt-4o');
    expect(caps.family).toBe('openai');
    expect(caps.thinking).toBe(false);
    expect(caps.promptCaching).toBe(true);
    expect(caps.toolUse).toBe(true);
    expect(caps.maxContextTokens).toBe(128_000);
  });

  it('returns correct config for o1 / reasoning models', () => {
    const caps = detectCapabilities('o1-preview');
    expect(caps.thinking).toBe(true);
    expect(caps.promptCaching).toBe(true);
    expect(caps.maxContextTokens).toBe(200_000);
  });

  it('returns correct config for o3 models', () => {
    const caps = detectCapabilities('o3-mini');
    expect(caps.thinking).toBe(true);
    expect(caps.promptCaching).toBe(true);
    expect(caps.maxContextTokens).toBe(200_000);
  });

  it('returns correct config for gpt-5 models', () => {
    const caps = detectCapabilities('gpt-5');
    expect(caps.thinking).toBe(true);
    expect(caps.promptCaching).toBe(true);
    expect(caps.maxContextTokens).toBe(400_000);
  });

  it('falls back to safe defaults on unknown generic models', () => {
    const caps = detectCapabilities('some-other-model');
    expect(caps.family).toBe('openai');
    expect(caps.thinking).toBe(false);
    expect(caps.promptCaching).toBe(false);
    expect(caps.maxContextTokens).toBe(128_000);
  });
});
