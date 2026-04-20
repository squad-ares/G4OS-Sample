import { EMPTY } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { createClaudeFactory, supportsClaudeConnection } from '../../claude/factory.ts';
import type { ClaudeProvider } from '../../claude/types.ts';
import type { AgentConfig } from '../../interface/agent.ts';

describe('supportsClaudeConnection', () => {
  it('matches anthropic/claude/bedrock-claude/claude-compat prefixes', () => {
    expect(supportsClaudeConnection('anthropic-direct')).toBe(true);
    expect(supportsClaudeConnection('claude-enterprise')).toBe(true);
    expect(supportsClaudeConnection('bedrock-claude-us-east')).toBe(true);
    expect(supportsClaudeConnection('claude-compat-openrouter')).toBe(true);
  });
  it('rejects unrelated slugs', () => {
    expect(supportsClaudeConnection('openai-direct')).toBe(false);
    expect(supportsClaudeConnection('google-vertex')).toBe(false);
  });
});

describe('createClaudeFactory', () => {
  function fakeProvider(): ClaudeProvider {
    return {
      kind: 'direct',
      createMessage: () => Promise.resolve(EMPTY as unknown as AsyncIterable<never>),
    };
  }

  it('factory.kind is "claude" and supports() uses the prefix check', () => {
    const factory = createClaudeFactory({ resolveProvider: fakeProvider });
    expect(factory.kind).toBe('claude');
    expect(factory.supports({ connectionSlug: 'anthropic-direct', modelId: 'x' })).toBe(true);
    expect(factory.supports({ connectionSlug: 'openai-direct', modelId: 'x' })).toBe(false);
  });

  it('create() wires the provider returned by resolveProvider and carries capabilities', () => {
    const resolveProvider = vi.fn(fakeProvider);
    const factory = createClaudeFactory({ resolveProvider });
    const config: AgentConfig = {
      connectionSlug: 'anthropic-direct',
      modelId: 'claude-sonnet-4-6',
    };
    const agent = factory.create(config);
    expect(agent.kind).toBe('claude');
    expect(agent.capabilities.maxContextTokens).toBe(1_000_000);
    expect(resolveProvider).toHaveBeenCalledWith(config);
    agent.dispose();
  });
});
