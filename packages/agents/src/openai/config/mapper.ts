import type { ContentBlock, Message } from '@g4os/kernel';
import type { AgentConfig } from '../../interface/agent.ts';
import { resolveThinkingConfig } from '../../shared/thinking/level-resolver.ts';
import type {
  OpenAIChatMessage,
  OpenAIStreamParams,
  OpenAIToolCall,
  OpenAIToolParam,
} from '../types.ts';

export interface MapConfigOptions {
  readonly promptCacheKey?: string;
}

export function mapConfig(
  config: AgentConfig,
  messages: readonly Message[],
  options: MapConfigOptions = {},
): OpenAIStreamParams {
  const chatMessages = buildChatMessages(config, messages);
  const thinking = resolveThinkingConfig(config.thinkingLevel, 'openai', config.modelId);
  const params: OpenAIStreamParams = {
    model: config.modelId,
    messages: chatMessages,
    stream: true,
    ...(config.maxTokens === undefined ? {} : { max_tokens: config.maxTokens }),
    ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
    ...(config.tools === undefined || config.tools.length === 0
      ? {}
      : { tools: config.tools.map(mapTool) }),
    ...(thinking.provider === 'openai' ? { reasoning_effort: thinking.reasoningEffort } : {}),
    ...(options.promptCacheKey === undefined ? {} : { prompt_cache_key: options.promptCacheKey }),
  };
  return params;
}

// ─── Message mapping ───────────────────────────────────────────────────────

function buildChatMessages(config: AgentConfig, messages: readonly Message[]): OpenAIChatMessage[] {
  const result: OpenAIChatMessage[] = [];

  if (config.systemPrompt !== undefined) {
    result.push({ role: 'system', content: config.systemPrompt });
  }

  for (const message of messages) {
    const mapped = mapMessage(message);
    if (mapped !== null) result.push(mapped);
  }

  return result;
}

/**
 * Maps a kernel Message to the OpenAI wire format.
 *
 * Key rules:
 * - `assistant` messages with tool_use blocks → { role:'assistant', tool_calls:[...] }
 * - `tool` messages (tool results) → { role:'tool', tool_call_id, content }
 * - `user` messages → { role:'user', content }
 * - `thinking` blocks are omitted (OpenAI has no equivalent)
 */
function mapMessage(message: Message): OpenAIChatMessage | null {
  switch (message.role) {
    case 'user':
      return mapUserMessage(message);
    case 'assistant':
      return mapAssistantMessage(message);
    case 'tool':
      return mapToolMessage(message);
    case 'system':
      return { role: 'system', content: extractPlainText(message.content) };
    default: {
      const _exhaustive: never = message.role;
      void _exhaustive;
      return null;
    }
  }
}

function mapUserMessage(message: Message): OpenAIChatMessage | null {
  const text = extractPlainText(message.content);
  if (text.length === 0) return null;
  return { role: 'user', content: text };
}

function mapAssistantMessage(message: Message): OpenAIChatMessage | null {
  const toolCalls: OpenAIToolCall[] = [];
  const textParts: string[] = [];

  for (const block of message.content) {
    if (block.type === 'text') {
      textParts.push(block.text);
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.toolUseId,
        type: 'function',
        function: {
          name: block.toolName,
          arguments: JSON.stringify(block.input),
        },
      });
    }
    // thinking blocks are skipped — no OpenAI equivalent
  }

  const content = textParts.join('');

  if (toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: content.length > 0 ? content : null,
      tool_calls: toolCalls,
    };
  }

  if (content.length === 0) return null;
  return { role: 'assistant', content };
}

function mapToolMessage(message: Message): OpenAIChatMessage | null {
  // kernel tool messages: role='tool', content contains tool_result blocks
  for (const block of message.content) {
    if (block.type === 'tool_result') {
      const text =
        typeof block.content === 'string'
          ? block.content
          : block.content.map((b) => b.text).join('');
      return {
        role: 'tool',
        tool_call_id: block.toolUseId,
        content: text,
      };
    }
  }
  // Fallback: treat any text as tool response (shouldn't happen with well-formed data)
  const text = extractPlainText(message.content);
  if (text.length === 0) return null;
  return { role: 'user', content: text };
}

/**
 * Extracts plain text from content blocks.
 * Skips tool_use, tool_result, and thinking blocks.
 */
function extractPlainText(blocks: readonly ContentBlock[]): string {
  return blocks
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function mapTool(tool: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}): OpenAIToolParam {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  };
}
