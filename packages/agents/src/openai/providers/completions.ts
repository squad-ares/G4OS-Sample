import type {
  OpenAIProvider,
  OpenAIProviderCallContext,
  OpenAIStreamChunk,
  OpenAIStreamParams,
} from '../types.ts';
import { normalizeBaseUrl } from './base.ts';

export interface CompletionsProviderOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly sdkFactory?: () => Promise<OpenAISdkLike>;
}

export interface OpenAISdkLike {
  createChatCompletionStream(
    params: OpenAIStreamParams,
    signal: AbortSignal,
  ): Promise<AsyncIterable<OpenAIStreamChunk>>;
}

export class CompletionsProvider implements OpenAIProvider {
  readonly kind = 'completions' as const;

  constructor(private readonly options: CompletionsProviderOptions) {}

  async openStream(
    params: OpenAIStreamParams,
    context: OpenAIProviderCallContext,
  ): Promise<AsyncIterable<OpenAIStreamChunk>> {
    const sdk = await this.resolveSdk();
    return sdk.createChatCompletionStream(params, context.signal);
  }

  private resolveSdk(): Promise<OpenAISdkLike> {
    if (this.options.sdkFactory !== undefined) {
      return this.options.sdkFactory();
    }
    return loadDefaultSdk(this.options);
  }
}

async function loadDefaultSdk(options: CompletionsProviderOptions): Promise<OpenAISdkLike> {
  const specifier = 'openai';
  const mod = (await import(/* @vite-ignore */ specifier)) as {
    default: new (args: { apiKey: string; baseURL?: string }) => OpenAIRuntime;
  };
  const client = new mod.default({
    apiKey: options.apiKey,
    ...(options.baseUrl === undefined ? {} : { baseURL: normalizeBaseUrl(options.baseUrl) }),
  });
  return {
    createChatCompletionStream: async (params, signal) => adaptChatStream(client, params, signal),
  };
}

interface OpenAIRuntime {
  chat: {
    completions: {
      create(
        params: OpenAIStreamParams,
        options?: { signal?: AbortSignal },
      ): Promise<AsyncIterable<unknown>>;
    };
  };
}

async function* adaptChatStream(
  client: OpenAIRuntime,
  params: OpenAIStreamParams,
  signal: AbortSignal,
): AsyncIterable<OpenAIStreamChunk> {
  const raw = await client.chat.completions.create(params, { signal });
  for await (const chunk of raw) {
    yield* translateRawChunk(chunk);
  }
}

function* translateRawChunk(raw: unknown): Iterable<OpenAIStreamChunk> {
  if (typeof raw !== 'object' || raw === null) return;
  const obj = raw as {
    choices?: readonly unknown[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number };
    };
  };

  // ADR-0074 / F-CR31-6: chunk final com stream_options.include_usage=true
  // traz usage no nível do objeto (choices pode ser vazio nesse chunk).
  if (obj.usage) {
    const u = obj.usage;
    const inputTokens = u.prompt_tokens ?? 0;
    const outputTokens = u.completion_tokens ?? 0;
    const cacheRead = u.prompt_tokens_details?.cached_tokens;
    yield {
      type: 'usage',
      input: inputTokens,
      output: outputTokens,
      ...(cacheRead === undefined ? {} : { cacheRead }),
    };
  }

  const choice = obj.choices?.[0];
  if (typeof choice !== 'object' || choice === null) return;
  const { delta, finish_reason: finishReason } = choice as {
    delta?: {
      content?: string;
      reasoning?: string;
      tool_calls?: ReadonlyArray<{
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string;
  };

  if (delta) yield* processDelta(delta);

  if (typeof finishReason === 'string') {
    // ADR-0074: preservar finish_reason original para o OpenAIEventMapper
    // coercir corretamente. Silenciar 'tool_calls' → 'stop' fazia o
    // runToolLoop jamais detectar tool use e abandonar a chamada de função.
    const mapped: 'stop' | 'length' | 'tool_calls' | 'content_filter' =
      finishReason === 'stop' ||
      finishReason === 'length' ||
      finishReason === 'tool_calls' ||
      finishReason === 'content_filter'
        ? (finishReason as 'stop' | 'length' | 'tool_calls' | 'content_filter')
        : 'stop';
    yield { type: 'done', finishReason: mapped };
  }
}

function* processDelta(delta: {
  content?: string;
  reasoning?: string;
  tool_calls?: ReadonlyArray<{
    index: number;
    id?: string;
    function?: { name?: string; arguments?: string };
  }>;
}): Iterable<OpenAIStreamChunk> {
  if (delta.content !== undefined && delta.content.length > 0) {
    yield { type: 'text_delta', text: delta.content };
  }
  if (delta.reasoning !== undefined && delta.reasoning.length > 0) {
    yield { type: 'reasoning_delta', text: delta.reasoning };
  }
  if (delta.tool_calls !== undefined) {
    for (const tc of delta.tool_calls) {
      yield mapToolCallDelta(tc);
    }
  }
}

function mapToolCallDelta(tc: {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}): OpenAIStreamChunk {
  const result: {
    type: 'tool_call_delta';
    index: number;
    id?: string;
    name?: string;
    argumentsChunk?: string;
  } = {
    type: 'tool_call_delta',
    index: tc.index,
  };
  if (tc.id !== undefined) result.id = tc.id;
  if (tc.function?.name !== undefined) result.name = tc.function.name;
  if (tc.function?.arguments !== undefined) result.argumentsChunk = tc.function.arguments;
  return result as OpenAIStreamChunk;
}
