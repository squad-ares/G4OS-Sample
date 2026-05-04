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
  const state: ResponsesStreamState = { pendingToolCalls: 0 };
  const raw = await client.responses.create(params, { signal });
  for await (const event of raw) {
    yield* translateResponsesEvent(event, state);
  }
}

// ADR-0074 / F-CR31-7: estado de stream por chamada a adaptResponsesStream.
// Responses API emite `response.output_item.done` UMA VEZ POR TOOL CALL —
// emitir `done` nesse evento causava encerramento prematuro quando o modelo
// chamava 2+ tools. Agora rastreamos se há tool calls pendentes e só
// emitimos `done` em `response.completed` (que é emitido uma única vez no
// fim do response).
interface ResponsesStreamState {
  pendingToolCalls: number;
}

function* translateResponsesEvent(
  raw: unknown,
  state: ResponsesStreamState,
): Iterable<OpenAIStreamChunk> {
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

  // Tool call started — emit start with id and name, incrementa contador
  if (
    event.type === 'response.output_item.added' &&
    event.item?.type === 'function_call' &&
    typeof event.item.id === 'string' &&
    typeof event.item.name === 'string'
  ) {
    state.pendingToolCalls += 1;
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

  // Tool call item concluído — decrementa contador mas NÃO emite done.
  // O done com finishReason='tool_calls' é emitido apenas em
  // response.completed (abaixo) quando todos os items estão prontos.
  if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
    if (state.pendingToolCalls > 0) state.pendingToolCalls -= 1;
    return;
  }

  // Full response completed — único ponto de emissão de done
  if (event.type === 'response.completed') {
    const finishReason = state.pendingToolCalls > 0 ? 'tool_calls' : 'stop';
    yield { type: 'done', finishReason };
  }
}
