import type { ThinkingLevel } from '../../interface/agent.ts';

export type ProviderThinkingConfig =
  | { readonly provider: 'openai'; readonly reasoningEffort: 'low' | 'medium' | 'high' }
  | { readonly provider: 'google'; readonly thinkingBudget: number | 'dynamic' }
  | { readonly provider: 'anthropic'; readonly budgetTokens: number }
  | { readonly provider: 'none' };

type Provider = 'openai' | 'google' | 'anthropic';

const OPENAI_MAP: Readonly<Record<ThinkingLevel, 'low' | 'medium' | 'high'>> = {
  low: 'low',
  think: 'medium',
  high: 'high',
  ultra: 'high',
};

const GOOGLE_MAP: Readonly<Record<ThinkingLevel, number | 'dynamic'>> = {
  low: 512,
  think: 2048,
  high: 8192,
  ultra: 'dynamic',
};

const ANTHROPIC_MAP: Readonly<Record<ThinkingLevel, number>> = {
  low: 1024,
  think: 4096,
  high: 16384,
  ultra: 32768,
};

export function resolveThinkingConfig(
  level: ThinkingLevel | undefined,
  provider: Provider,
  modelId: string,
): ProviderThinkingConfig {
  if (level === undefined || !modelSupportsThinking(provider, modelId)) {
    return { provider: 'none' };
  }
  if (provider === 'openai') {
    return { provider: 'openai', reasoningEffort: OPENAI_MAP[level] };
  }
  if (provider === 'google') {
    return { provider: 'google', thinkingBudget: GOOGLE_MAP[level] };
  }
  return { provider: 'anthropic', budgetTokens: ANTHROPIC_MAP[level] };
}

function modelSupportsThinking(provider: Provider, modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (provider === 'openai') {
    return id.startsWith('o1') || id.startsWith('o3') || id.startsWith('gpt-5');
  }
  if (provider === 'google') {
    return id.includes('gemini-2') || id.includes('gemini-3');
  }
  return (
    id.includes('claude-3.7') || id.includes('claude-sonnet-4') || id.includes('claude-opus-4')
  );
}
