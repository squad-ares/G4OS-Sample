import type { ContentBlock, Message } from '@g4os/kernel';
import type { AgentConfig, ThinkingLevel } from '../../interface/agent.ts';
import type {
  ClaudeContentBlockInput,
  ClaudeCreateMessageParams,
  ClaudeMessage,
  ClaudeRequestOptions,
  ClaudeSystemBlock,
  ClaudeThinkingConfig,
  ClaudeToolParam,
} from '../types.ts';

const DEFAULT_MAX_TOKENS = 4096;

const THINKING_BUDGET_BY_LEVEL: Record<ThinkingLevel, number> = {
  low: 2_000,
  think: 5_000,
  high: 12_000,
  ultra: 32_000,
};

export function mapThinking(
  level: ThinkingLevel | undefined,
  override: number | undefined,
): ClaudeThinkingConfig | undefined {
  if (override !== undefined) {
    return { type: 'enabled', budget_tokens: override };
  }
  if (!level) return undefined;
  return { type: 'enabled', budget_tokens: THINKING_BUDGET_BY_LEVEL[level] };
}

export function mapContentBlock(block: ContentBlock): ClaudeContentBlockInput | undefined {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'tool_use':
      return {
        type: 'tool_use',
        id: block.toolUseId,
        name: block.toolName,
        input: block.input,
      };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: block.toolUseId,
        content:
          typeof block.content === 'string'
            ? block.content
            : block.content.map((c) => ({ type: 'text' as const, text: c.text })),
        is_error: block.isError,
      };
    case 'thinking':
      return { type: 'thinking', thinking: block.text };
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

function mapRole(role: Message['role']): 'user' | 'assistant' | undefined {
  if (role === 'user' || role === 'tool') return 'user';
  if (role === 'assistant') return 'assistant';
  return undefined;
}

export function mapMessages(messages: readonly Message[]): readonly ClaudeMessage[] {
  const out: ClaudeMessage[] = [];
  for (const message of messages) {
    const role = mapRole(message.role);
    if (!role) continue;
    const content: ClaudeContentBlockInput[] = [];
    for (const block of message.content) {
      const mapped = mapContentBlock(block);
      if (mapped) content.push(mapped);
    }
    if (content.length === 0) continue;
    out.push({ role, content });
  }
  return out;
}

export function mapSystemPrompt(systemPrompt: string | undefined): readonly ClaudeSystemBlock[] {
  if (!systemPrompt || systemPrompt.trim().length === 0) return [];
  return [{ type: 'text', text: systemPrompt }];
}

export function mapTools(config: AgentConfig): readonly ClaudeToolParam[] {
  if (!config.tools || config.tools.length === 0) return [];
  return config.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

export function mapConfig(
  config: AgentConfig,
  messages: readonly Message[],
  options: ClaudeRequestOptions = { maxTokens: DEFAULT_MAX_TOKENS },
): ClaudeCreateMessageParams {
  const thinking = mapThinking(config.thinkingLevel, options.thinkingBudget);
  const system = mapSystemPrompt(config.systemPrompt);
  const tools = mapTools(config);
  const params: ClaudeCreateMessageParams = {
    model: config.modelId,
    max_tokens: config.maxTokens ?? options.maxTokens,
    messages: mapMessages(messages),
    stream: true,
    ...(system.length > 0 ? { system } : {}),
    ...(tools.length > 0 ? { tools } : {}),
    ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
    ...(thinking ? { thinking } : {}),
  };
  return params;
}
