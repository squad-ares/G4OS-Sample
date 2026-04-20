import { describe, expect, it } from 'vitest';
import { detectCapabilities } from '../../claude/capabilities.ts';

describe('detectCapabilities', () => {
  it('returns Opus 4 profile with thinking + caching', () => {
    const caps = detectCapabilities('claude-opus-4-7');
    expect(caps.family).toBe('anthropic');
    expect(caps.thinking).toBe(true);
    expect(caps.promptCaching).toBe(true);
    expect(caps.maxContextTokens).toBe(200_000);
  });

  it('returns Sonnet 4 profile with 1M context', () => {
    const caps = detectCapabilities('claude-sonnet-4-6');
    expect(caps.maxContextTokens).toBe(1_000_000);
    expect(caps.thinking).toBe(true);
  });

  it('returns Haiku 4 profile with thinking + default context', () => {
    const caps = detectCapabilities('claude-haiku-4-5-20251001');
    expect(caps.thinking).toBe(true);
    expect(caps.maxContextTokens).toBe(200_000);
  });

  it('disables thinking on legacy Claude 3.5 models', () => {
    const caps = detectCapabilities('claude-3-5-sonnet-20240620');
    expect(caps.thinking).toBe(false);
    expect(caps.promptCaching).toBe(true);
  });

  it('legacy Claude 3 Opus has no prompt caching', () => {
    const caps = detectCapabilities('claude-3-opus-20240229');
    expect(caps.promptCaching).toBe(false);
  });

  it('falls back to safe defaults on unknown model id', () => {
    const caps = detectCapabilities('claude-unknown-future');
    expect(caps.streaming).toBe(true);
    expect(caps.toolUse).toBe(true);
    expect(caps.family).toBe('anthropic');
    expect(caps.thinking).toBe(false);
  });
});
