import type { AgentCapabilities } from '../interface/agent.ts';

export function detectCapabilities(modelId: string): AgentCapabilities {
  const id = modelId.toLowerCase();
  const isReasoning = id.startsWith('o1') || id.startsWith('o3') || id.startsWith('gpt-5');
  const supportsPromptCache =
    id.startsWith('gpt-4o') || id.startsWith('gpt-5') || id.startsWith('o1') || id.startsWith('o3');
  return {
    family: 'openai',
    streaming: true,
    thinking: isReasoning,
    toolUse: true,
    promptCaching: supportsPromptCache,
    maxContextTokens: resolveMaxContext(id),
    supportedTools: 'all',
  };
}

function resolveMaxContext(id: string): number {
  if (id.startsWith('gpt-5')) return 400_000;
  if (id.startsWith('o3')) return 200_000;
  if (id.startsWith('o1')) return 200_000;
  if (id.startsWith('gpt-4o')) return 128_000;
  return 128_000;
}
