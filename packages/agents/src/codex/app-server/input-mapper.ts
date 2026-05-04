import type { ContentBlock, Message } from '@g4os/kernel';
import type { AgentConfig, AgentTurnInput, ThinkingLevel } from '../../interface/agent.ts';
import type {
  CodexRunTurnInput,
  CodexToolInputSchema,
  CodexWireContentBlock,
  CodexWireMessage,
  CodexWireThinkingLevel,
  CodexWireTool,
} from './protocol.ts';

// `satisfies Record<ThinkingLevel, ...>` força que adicionar um novo nível em
// `ThinkingLevel` quebre o mapper em compile-time. NÃO trocar pra Partial — o
// silent strip era o bug original (ver CR-18 F-CT1).
const THINKING_LEVEL_MAP = {
  low: 'low',
  think: 'low',
  high: 'medium',
  ultra: 'high',
} as const satisfies Record<ThinkingLevel, CodexWireThinkingLevel>;

function mapBlock(block: ContentBlock): CodexWireContentBlock | undefined {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'tool_use':
      return {
        type: 'tool_use',
        toolUseId: block.toolUseId,
        name: block.toolName,
        input: block.input,
      };
    case 'tool_result':
      return {
        type: 'tool_result',
        toolUseId: block.toolUseId,
        content:
          typeof block.content === 'string'
            ? block.content
            : block.content.map((c) => c.text).join('\n'),
        isError: block.isError,
      };
    case 'thinking':
      return undefined;
    default: {
      const exhaustive: never = block;
      return exhaustive;
    }
  }
}

function mapRole(role: Message['role']): CodexWireMessage['role'] | undefined {
  if (role === 'user' || role === 'tool' || role === 'assistant') return role;
  return undefined;
}

function mapMessages(messages: readonly Message[]): readonly CodexWireMessage[] {
  const out: CodexWireMessage[] = [];
  for (const message of messages) {
    const role = mapRole(message.role);
    if (!role) continue;
    const content: CodexWireContentBlock[] = [];
    for (const block of message.content) {
      const mapped = mapBlock(block);
      if (mapped) content.push(mapped);
    }
    if (content.length === 0) continue;
    out.push({ role, content });
  }
  return out;
}

function mapTools(config: AgentConfig): readonly CodexWireTool[] | undefined {
  if (!config.tools || config.tools.length === 0) return undefined;
  return config.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    // `ToolDefinition.inputSchema` é `Record<string, unknown>` (kernel schema),
    // mais fraco que `CodexToolInputSchema`. Coerção necessária na fronteira —
    // a validação do shape JSON Schema acontece antes da chegada aqui (Zod parse
    // em AgentConfigSchema). Em campo, tools sempre chegam com `type: 'object'`.
    inputSchema: tool.inputSchema as CodexToolInputSchema,
  }));
}

export function mapAgentInputToCodex(input: AgentTurnInput): CodexRunTurnInput {
  const tools = mapTools(input.config);
  return {
    messages: mapMessages(input.messages),
    model: input.config.modelId,
    ...(input.config.systemPrompt ? { instructions: input.config.systemPrompt } : {}),
    ...(tools ? { tools } : {}),
    ...(input.config.thinkingLevel
      ? { thinkingLevel: THINKING_LEVEL_MAP[input.config.thinkingLevel] }
      : {}),
  };
}
