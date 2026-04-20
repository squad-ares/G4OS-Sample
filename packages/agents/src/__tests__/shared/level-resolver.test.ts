import { describe, expect, it } from 'vitest';
import { resolveThinkingConfig } from '../../shared/thinking/level-resolver.ts';

describe('resolveThinkingConfig', () => {
  it('returns none when level is undefined', () => {
    expect(resolveThinkingConfig(undefined, 'openai', 'gpt-5')).toEqual({ provider: 'none' });
  });

  it('returns none when model does not support thinking', () => {
    expect(resolveThinkingConfig('high', 'openai', 'gpt-4')).toEqual({ provider: 'none' });
    expect(resolveThinkingConfig('high', 'google', 'gemini-1.5-pro')).toEqual({ provider: 'none' });
    expect(resolveThinkingConfig('high', 'anthropic', 'claude-3.5-sonnet')).toEqual({
      provider: 'none',
    });
  });

  it('maps levels to OpenAI reasoning effort', () => {
    expect(resolveThinkingConfig('low', 'openai', 'o3-mini')).toEqual({
      provider: 'openai',
      reasoningEffort: 'low',
    });
    expect(resolveThinkingConfig('think', 'openai', 'gpt-5')).toEqual({
      provider: 'openai',
      reasoningEffort: 'medium',
    });
    expect(resolveThinkingConfig('high', 'openai', 'gpt-5')).toEqual({
      provider: 'openai',
      reasoningEffort: 'high',
    });
    expect(resolveThinkingConfig('ultra', 'openai', 'gpt-5')).toEqual({
      provider: 'openai',
      reasoningEffort: 'high',
    });
  });

  it('maps levels to Google thinkingBudget', () => {
    expect(resolveThinkingConfig('low', 'google', 'gemini-2.5-pro')).toEqual({
      provider: 'google',
      thinkingBudget: 512,
    });
    expect(resolveThinkingConfig('ultra', 'google', 'gemini-3.0-pro')).toEqual({
      provider: 'google',
      thinkingBudget: 'dynamic',
    });
  });

  it('maps levels to Anthropic budgetTokens', () => {
    expect(resolveThinkingConfig('low', 'anthropic', 'claude-sonnet-4-6')).toEqual({
      provider: 'anthropic',
      budgetTokens: 1024,
    });
    expect(resolveThinkingConfig('ultra', 'anthropic', 'claude-opus-4-7')).toEqual({
      provider: 'anthropic',
      budgetTokens: 32768,
    });
  });
});
