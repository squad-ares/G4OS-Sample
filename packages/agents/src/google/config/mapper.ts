import type { Message, ToolDefinition } from '@g4os/kernel';
import type { AgentConfig } from '../../interface/agent.ts';
import {
  type GeminiContent,
  type GeminiFunctionDeclaration,
  type GeminiPart,
  type GeminiStreamParams,
  type GeminiTool,
  toGeminiSafeToolName,
  toGeminiSafeToolNameUnique,
} from '../types.ts';

const CLASSIFIER_SYSTEM_PROMPT = [
  'You are a routing classifier for G4 OS.',
  'Decide whether the latest user message should use native URL Context, native Google Search,' +
    ' native YouTube analysis, or stay in the custom-tools lane.',
  'Choose "native_url_context" when the request is mainly about understanding or summarizing a URL.',
  'Choose "native_search" when fresh public-web facts or recent events are needed.',
  'Choose "native_youtube" when the user provides a youtube.com or youtu.be URL to a video.',
  'Choose "custom_tools" for writing, coding, reasoning, file work, or local context.',
  'Reply with JSON only: {"strategy":"native_url_context"} | {"strategy":"native_search"} |' +
    ' {"strategy":"native_youtube"} | {"strategy":"custom_tools"}.',
].join(' ');

export function buildClassifierContents(text: string): GeminiContent[] {
  return [{ role: 'user', parts: [{ text }] }];
}

export function mapMessagesToGemini(messages: readonly Message[]): GeminiContent[] {
  const contents: GeminiContent[] = [];
  // ADR-0075: rastreia toolUseId → toolName da assistant message anterior
  // para resolver o nome correto no functionResponse. Message.role='tool'
  // só carrega toolUseId nos blocos tool_result — sem este mapa o nome
  // ficaria 'unknown', Gemini rejeitaria silenciosamente e multi-turn
  // tool use quebraria.
  const toolUseIdToName = new Map<string, string>();
  for (const msg of messages) {
    if (msg.role === 'user') {
      const parts = buildUserParts(msg);
      if (parts.length > 0) contents.push({ role: 'user', parts });
    } else if (msg.role === 'assistant') {
      // Indexar tool_use blocks antes de emitir os parts
      for (const block of msg.content as ReadonlyArray<{
        type: string;
        toolUseId?: string;
        toolName?: string;
      }>) {
        if (block.type === 'tool_use' && block.toolUseId && block.toolName) {
          toolUseIdToName.set(block.toolUseId, block.toolName);
        }
      }
      const parts = buildAssistantParts(msg);
      if (parts.length > 0) contents.push({ role: 'model', parts });
    } else if (msg.role === 'tool') {
      contents.push({
        role: 'user',
        parts: buildToolResultParts(msg, toolUseIdToName),
      });
    }
  }
  return contents;
}

function buildUserParts(msg: Message): GeminiPart[] {
  if (typeof msg.content === 'string') return [{ text: msg.content }];
  const parts: GeminiPart[] = [];
  for (const block of msg.content as ReadonlyArray<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>) {
    if (block.type === 'text' && block.text) {
      parts.push({ text: block.text });
    } else if (block.type === 'image' && block.data && block.mimeType) {
      parts.push({ inlineData: { mimeType: block.mimeType, data: block.data } });
    }
  }
  return parts;
}

function buildAssistantParts(msg: Message): GeminiPart[] {
  if (typeof msg.content === 'string') return [{ text: msg.content }];
  const parts: GeminiPart[] = [];
  for (const block of msg.content as ReadonlyArray<{
    type: string;
    text?: string;
    content?: string;
    id?: string;
    toolName?: string;
    input?: Record<string, unknown>;
  }>) {
    if (block.type === 'text' && block.text) {
      parts.push({ text: block.text });
    } else if (block.type === 'thinking' && block.text) {
      parts.push({ text: `[Reasoning omitted]\n${block.text}` });
    } else if (block.type === 'tool_use' && block.toolName && block.input) {
      parts.push({
        functionCall: {
          name: toGeminiSafeToolName(block.toolName),
          args: block.input,
        },
      });
    }
  }
  return parts;
}

function buildToolResultParts(
  msg: Message,
  toolUseIdToName: ReadonlyMap<string, string>,
): GeminiPart[] {
  const parts: GeminiPart[] = [];
  for (const block of msg.content as ReadonlyArray<{
    type: string;
    toolUseId?: string;
    content?: string | { text: string }[];
  }>) {
    if (block.type !== 'tool_result') continue;
    const content =
      block.content === undefined
        ? ''
        : typeof block.content === 'string'
          ? block.content
          : block.content.map((c) => c.text).join('');
    // ADR-0075: resolver toolName via mapa; fallback 'unknown_tool' apenas
    // quando o histórico está incompleto (ex: sessão truncada).
    const toolName = (block.toolUseId && toolUseIdToName.get(block.toolUseId)) ?? 'unknown_tool';
    parts.push({
      functionResponse: {
        name: toGeminiSafeToolName(toolName),
        response: { result: content },
      },
    });
  }
  // Fallback para mensagem mal-formada: emite um único part vazio para não
  // gerar turn vazio que confunde o Gemini.
  if (parts.length === 0) {
    parts.push({
      functionResponse: {
        name: toGeminiSafeToolName('unknown_tool'),
        response: { result: '' },
      },
    });
  }
  return parts;
}

export function mapToolsToGemini(
  tools: readonly ToolDefinition[],
  usedNames: Set<string>,
): GeminiTool[] {
  if (tools.length === 0) return [];
  const declarations: GeminiFunctionDeclaration[] = tools.map((t) => ({
    name: toGeminiSafeToolNameUnique(t.name, usedNames),
    description: t.description,
    ...(t.inputSchema === undefined ? {} : { parameters: t.inputSchema }),
  }));
  return [{ functionDeclarations: declarations }];
}

export function buildGeminiStreamParams(
  config: AgentConfig,
  messages: readonly Message[],
): Pick<GeminiStreamParams, 'model' | 'systemInstruction' | 'contents' | 'tools' | 'temperature'> {
  const usedNames = new Set<string>();
  return {
    model: config.modelId.replace(/^pi\//, ''),
    ...(config.systemPrompt ? { systemInstruction: config.systemPrompt } : {}),
    contents: mapMessagesToGemini(messages),
    ...(config.tools && config.tools.length > 0
      ? { tools: mapToolsToGemini(config.tools, usedNames) }
      : {}),
    // ADR-0075 / F-CR31-8: propaga temperature do AgentConfig. Sem isso o
    // Gemini ignorava silenciosamente o ajuste do usuário na UI.
    ...(config.temperature === undefined ? {} : { temperature: config.temperature }),
  };
}

export { CLASSIFIER_SYSTEM_PROMPT };
