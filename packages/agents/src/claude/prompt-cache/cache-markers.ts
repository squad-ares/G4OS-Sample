import type {
  ClaudeCacheControl,
  ClaudeContentBlockInput,
  ClaudeCreateMessageParams,
  ClaudeMessage,
  ClaudeSystemBlock,
  ClaudeToolParam,
} from '../types.ts';

const CACHE_CONTROL_1H: ClaudeCacheControl = { type: 'ephemeral', ttl: '1h' };
const CACHE_CONTROL_DEFAULT: ClaudeCacheControl = { type: 'ephemeral' };

export type PromptCacheTtl = '1h' | '5m';

export interface PromptCacheOptions {
  readonly ttl?: PromptCacheTtl;
  readonly cacheSystem?: boolean;
  readonly cacheTools?: boolean;
  readonly cacheLastUserTurn?: boolean;
}

function controlFor(ttl: PromptCacheTtl | undefined): ClaudeCacheControl {
  if (ttl === '1h') return CACHE_CONTROL_1H;
  if (ttl === '5m') return { type: 'ephemeral', ttl: '5m' };
  return CACHE_CONTROL_DEFAULT;
}

function markSystem(
  system: readonly ClaudeSystemBlock[] | undefined,
  control: ClaudeCacheControl,
): readonly ClaudeSystemBlock[] | undefined {
  if (!system || system.length === 0) return system;
  const marked: ClaudeSystemBlock[] = system.map((block) => ({ ...block }));
  const last = marked[marked.length - 1];
  if (last) marked[marked.length - 1] = { ...last, cache_control: control };
  return marked;
}

function markTools(
  tools: readonly ClaudeToolParam[] | undefined,
  control: ClaudeCacheControl,
): readonly ClaudeToolParam[] | undefined {
  if (!tools || tools.length === 0) return tools;
  const marked: ClaudeToolParam[] = tools.map((tool) => ({ ...tool }));
  const last = marked[marked.length - 1];
  if (last) marked[marked.length - 1] = { ...last, cache_control: control };
  return marked;
}

function markLastBlockInMessage(
  message: ClaudeMessage,
  control: ClaudeCacheControl,
): ClaudeMessage {
  if (message.content.length === 0) return message;
  const content = message.content.map((block) => block);
  const lastIndex = content.length - 1;
  const last = content[lastIndex];
  if (!last) return message;
  if (last.type === 'text') {
    content[lastIndex] = { ...last, cache_control: control };
  }
  return { role: message.role, content };
}

function markLastUserTurn(
  messages: readonly ClaudeMessage[],
  control: ClaudeCacheControl,
): readonly ClaudeMessage[] {
  if (messages.length === 0) return messages;
  const out = messages.map((m) => m);
  for (let i = out.length - 1; i >= 0; i--) {
    const message = out[i];
    if (message?.role === 'user') {
      out[i] = markLastBlockInMessage(message, control);
      break;
    }
  }
  return out;
}

export function upgradeExistingMarkers(
  block: ClaudeContentBlockInput,
  ttl: PromptCacheTtl = '1h',
): ClaudeContentBlockInput {
  if (block.type !== 'text' || !block.cache_control) return block;
  return { ...block, cache_control: { type: 'ephemeral', ttl } };
}

export function applyPromptCache(
  request: ClaudeCreateMessageParams,
  options: PromptCacheOptions = {},
): ClaudeCreateMessageParams {
  const control = controlFor(options.ttl);

  const system =
    options.cacheSystem === false ? request.system : markSystem(request.system, control);
  const tools = options.cacheTools === false ? request.tools : markTools(request.tools, control);
  const messages = options.cacheLastUserTurn
    ? markLastUserTurn(request.messages, control)
    : request.messages;

  return {
    ...request,
    ...(system === undefined ? {} : { system }),
    ...(tools === undefined ? {} : { tools }),
    messages,
  };
}

export function applyPromptCache1hTtl(
  request: ClaudeCreateMessageParams,
): ClaudeCreateMessageParams {
  return applyPromptCache(request, { ttl: '1h', cacheSystem: true, cacheTools: true });
}
