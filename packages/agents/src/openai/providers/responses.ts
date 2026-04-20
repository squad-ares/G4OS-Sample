import type {
  OpenAIProvider,
  OpenAIProviderCallContext,
  OpenAIStreamChunk,
  OpenAIStreamParams,
} from '../types.ts';
import { normalizeBaseUrl } from './base.ts';

export interface ResponsesProviderOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly sdkFactory?: () => Promise<ResponsesSdkLike>;
}

export interface ResponsesSdkLike {
  createResponseStream(
    params: OpenAIStreamParams,
    signal: AbortSignal,
  ): Promise<AsyncIterable<OpenAIStreamChunk>>;
}

export class ResponsesProvider implements OpenAIProvider {
  readonly kind = 'responses' as const;

  constructor(private readonly options: ResponsesProviderOptions) {}

  async openStream(
    params: OpenAIStreamParams,
    context: OpenAIProviderCallContext,
  ): Promise<AsyncIterable<OpenAIStreamChunk>> {
    const sdk = await this.resolveSdk();
    return sdk.createResponseStream(params, context.signal);
  }

  private resolveSdk(): Promise<ResponsesSdkLike> {
    if (this.options.sdkFactory !== undefined) {
      return this.options.sdkFactory();
    }
    return loadDefaultSdk(this.options);
  }
}

async function loadDefaultSdk(options: ResponsesProviderOptions): Promise<ResponsesSdkLike> {
  const specifier = 'openai';
  const mod = (await import(/* @vite-ignore */ specifier)) as {
    default: new (args: { apiKey: string; baseURL?: string }) => ResponsesRuntime;
  };
  const client = new mod.default({
    apiKey: options.apiKey,
    ...(options.baseUrl === undefined ? {} : { baseURL: normalizeBaseUrl(options.baseUrl) }),
  });
  return {
    createResponseStream: async (params, signal) => adaptResponsesStream(client, params, signal),
  };
}

interface ResponsesRuntime {
  responses: {
    create(
      params: OpenAIStreamParams,
      options?: { signal?: AbortSignal },
    ): Promise<AsyncIterable<unknown>>;
  };
}

async function* adaptResponsesStream(
  client: ResponsesRuntime,
  params: OpenAIStreamParams,
  signal: AbortSignal,
): AsyncIterable<OpenAIStreamChunk> {
  const raw = await client.responses.create(params, { signal });
  for await (const event of raw) {
    yield* translateResponsesEvent(event);
  }
}

function* translateResponsesEvent(raw: unknown): Iterable<OpenAIStreamChunk> {
  if (typeof raw !== 'object' || raw === null) return;
  const event = raw as {
    type?: string;
    delta?: string;
    item?: {
      id?: string;
      name?: string;
      type?: string;
      call_id?: string;
      arguments?: string;
    };
    index?: number;
    response?: { status?: string };
  };

  // Text streaming
  if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
    yield { type: 'text_delta', text: event.delta };
    return;
  }

  // Reasoning/thinking streaming
  if (event.type === 'response.reasoning.delta' && typeof event.delta === 'string') {
    yield { type: 'reasoning_delta', text: event.delta };
    return;
  }

  // Tool call started — emit start with id and name
  if (
    event.type === 'response.output_item.added' &&
    event.item?.type === 'function_call' &&
    typeof event.item.id === 'string' &&
    typeof event.item.name === 'string'
  ) {
    yield {
      type: 'tool_call_delta',
      index: event.index ?? 0,
      id: event.item.id,
      name: event.item.name,
    };
    return;
  }

  // Tool call arguments streaming
  if (event.type === 'response.function_call_arguments.delta' && typeof event.delta === 'string') {
    yield {
      type: 'tool_call_delta',
      index: event.index ?? 0,
      argumentsChunk: event.delta,
    };
    return;
  }

  // Tool call completed
  if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
    yield { type: 'done', finishReason: 'tool_calls' };
    return;
  }

  // Full response completed
  if (event.type === 'response.completed') {
    yield { type: 'done', finishReason: 'stop' };
  }
}
