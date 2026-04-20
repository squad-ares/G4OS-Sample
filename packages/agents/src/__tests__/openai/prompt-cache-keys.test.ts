import { describe, expect, it } from 'vitest';
import { buildPromptCacheKey } from '../../openai/cache/prompt-cache-keys.ts';

describe('buildPromptCacheKey', () => {
  it('produces g4_<8-hex> format without workspace', () => {
    const key = buildPromptCacheKey({ connectionSlug: 'openai', toolNames: [] });
    expect(key).toMatch(/^g4_[0-9a-f]{8}$/);
  });

  it('produces g4_<8-hex> format with workspace', () => {
    const key = buildPromptCacheKey({
      workspaceId: 'ws-abc',
      connectionSlug: 'openai',
      toolNames: [],
    });
    expect(key).toMatch(/^g4_[0-9a-f]{8}$/);
  });

  it('differs when workspace changes', () => {
    const a = buildPromptCacheKey({ connectionSlug: 'openai', toolNames: [] });
    const b = buildPromptCacheKey({
      workspaceId: 'ws-abc',
      connectionSlug: 'openai',
      toolNames: [],
    });
    expect(a).not.toBe(b);
  });

  it('differs when toolset changes', () => {
    const a = buildPromptCacheKey({ connectionSlug: 'openai', toolNames: ['read_file'] });
    const b = buildPromptCacheKey({
      connectionSlug: 'openai',
      toolNames: ['read_file', 'bash'],
    });
    expect(a).not.toBe(b);
  });

  it('differs when connectionSlug changes', () => {
    const a = buildPromptCacheKey({ connectionSlug: 'openai', toolNames: [] });
    const b = buildPromptCacheKey({ connectionSlug: 'openai-compat', toolNames: [] });
    expect(a).not.toBe(b);
  });

  it('is stable — same inputs always produce same key', () => {
    const input = { workspaceId: 'ws-1', connectionSlug: 'openai', toolNames: ['bash', 'read'] };
    expect(buildPromptCacheKey(input)).toBe(buildPromptCacheKey(input));
  });

  it('sorts toolNames before hashing', () => {
    const a = buildPromptCacheKey({ connectionSlug: 'openai', toolNames: ['bash', 'read'] });
    const b = buildPromptCacheKey({ connectionSlug: 'openai', toolNames: ['read', 'bash'] });
    expect(a).toBe(b);
  });
});
