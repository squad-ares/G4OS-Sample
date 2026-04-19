import type { AgentCapabilities } from '../interface/agent.ts';

interface ClaudeModelProfile {
  readonly maxContextTokens: number;
  readonly thinking: boolean;
  readonly promptCaching: boolean;
}

const DEFAULT_PROFILE: ClaudeModelProfile = {
  maxContextTokens: 200_000,
  thinking: false,
  promptCaching: true,
};

const PROFILES: ReadonlyMap<RegExp, ClaudeModelProfile> = new Map([
  [/^claude-opus-4/, { maxContextTokens: 200_000, thinking: true, promptCaching: true } as const],
  [
    /^claude-sonnet-4/,
    { maxContextTokens: 1_000_000, thinking: true, promptCaching: true } as const,
  ],
  [/^claude-haiku-4/, { maxContextTokens: 200_000, thinking: true, promptCaching: true } as const],
  [
    /^claude-3-5-sonnet/,
    { maxContextTokens: 200_000, thinking: false, promptCaching: true } as const,
  ],
  [
    /^claude-3-5-haiku/,
    { maxContextTokens: 200_000, thinking: false, promptCaching: true } as const,
  ],
  [/^claude-3-opus/, { maxContextTokens: 200_000, thinking: false, promptCaching: false } as const],
]);

function resolveProfile(modelId: string): ClaudeModelProfile {
  for (const [pattern, profile] of PROFILES) {
    if (pattern.test(modelId)) return profile;
  }
  return DEFAULT_PROFILE;
}

export function detectCapabilities(modelId: string): AgentCapabilities {
  const profile = resolveProfile(modelId);
  return {
    family: 'anthropic',
    streaming: true,
    thinking: profile.thinking,
    toolUse: true,
    promptCaching: profile.promptCaching,
    maxContextTokens: profile.maxContextTokens,
    supportedTools: 'all',
  };
}
