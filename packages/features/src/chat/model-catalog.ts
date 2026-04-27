// TODO!: Revisar, talvez esse conteúdo deva ficar em agents

import type { TranslationKey } from '@g4os/translate';

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';
export type ModelProvider = 'claude' | 'codex' | 'pi-google' | 'pi-openai';

export interface ModelSpec {
  readonly id: string;
  readonly labelKey: TranslationKey;
  readonly provider: ModelProvider;
  readonly family: string;
  readonly supportsThinking: boolean;
  readonly thinkingLevels?: ReadonlyArray<ThinkingLevel>;
  readonly contextWindow: number;
}

export const MODELS: ReadonlyArray<ModelSpec> = [
  {
    id: 'claude-opus-4-7',
    labelKey: 'chat.models.claudeOpus47',
    provider: 'claude',
    family: 'claude-4',
    supportsThinking: true,
    thinkingLevels: ['low', 'medium', 'high'],
    contextWindow: 200_000,
  },
  {
    id: 'claude-sonnet-4-6',
    labelKey: 'chat.models.claudeSonnet46',
    provider: 'claude',
    family: 'claude-4',
    supportsThinking: true,
    thinkingLevels: ['low', 'medium', 'high'],
    contextWindow: 200_000,
  },
  {
    id: 'claude-haiku-4-5',
    labelKey: 'chat.models.claudeHaiku45',
    provider: 'claude',
    family: 'claude-4',
    supportsThinking: false,
    contextWindow: 200_000,
  },
  {
    id: 'gpt-5-codex',
    labelKey: 'chat.models.codexGpt5',
    provider: 'codex',
    family: 'codex',
    supportsThinking: false,
    contextWindow: 200_000,
  },
  {
    id: 'gemini-2.5-pro',
    labelKey: 'chat.models.gemini25Pro',
    provider: 'pi-google',
    family: 'gemini',
    supportsThinking: false,
    contextWindow: 1_000_000,
  },
] as const;

export function formatContextWindow(tokens: number): string {
  if (tokens >= 1_000_000) return `${tokens / 1_000_000}M`;
  return `${tokens / 1_000}K`;
}

export function findModel(id: string): ModelSpec | undefined {
  return MODELS.find((m) => m.id === id);
}
