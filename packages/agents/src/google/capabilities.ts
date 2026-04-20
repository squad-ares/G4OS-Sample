import type { AgentCapabilities } from '../interface/agent.ts';

const DEFAULT_CAPS: AgentCapabilities = {
  family: 'google',
  streaming: true,
  thinking: false,
  toolUse: true,
  promptCaching: false,
  maxContextTokens: 1_000_000,
  supportedTools: 'all',
};

const THINKING_MODELS = new Set([
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
]);

export function detectGeminiCapabilities(modelId: string): AgentCapabilities {
  const id = modelId.toLowerCase().replace(/^pi\//, '');
  const thinking = THINKING_MODELS.has(id) || id.includes('gemini-2.5') || id.includes('gemini-3');
  return { ...DEFAULT_CAPS, thinking };
}
