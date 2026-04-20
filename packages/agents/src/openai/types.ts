import type { ThinkingLevel } from '../interface/agent.ts';

export type OpenAIProviderKind = 'completions' | 'responses';

export type OpenAIRole = 'system' | 'user' | 'assistant' | 'tool';

export interface OpenAIChatMessage {
  readonly role: OpenAIRole;
  readonly content: string | readonly OpenAIContentPart[] | null;
  readonly tool_call_id?: string;
  readonly tool_calls?: readonly OpenAIToolCall[];
  readonly name?: string;
}

export type OpenAIContentPart =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'image_url';
      readonly image_url: { readonly url: string };
    };

export interface OpenAIToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: { readonly name: string; readonly arguments: string };
}

export interface OpenAIToolParam {
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Readonly<Record<string, unknown>>;
  };
}

export interface OpenAIStreamParams {
  readonly model: string;
  readonly messages: readonly OpenAIChatMessage[];
  readonly tools?: readonly OpenAIToolParam[];
  readonly temperature?: number;
  readonly max_tokens?: number;
  readonly reasoning_effort?: 'low' | 'medium' | 'high';
  readonly prompt_cache_key?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly stream: true;
}

export type OpenAIStreamChunk =
  | { readonly type: 'text_delta'; readonly text: string }
  | { readonly type: 'reasoning_delta'; readonly text: string }
  | {
      readonly type: 'tool_call_delta';
      readonly index: number;
      readonly id?: string;
      readonly name?: string;
      readonly argumentsChunk?: string;
    }
  | {
      readonly type: 'usage';
      readonly input: number;
      readonly output: number;
      readonly cacheRead?: number;
    }
  | {
      readonly type: 'done';
      readonly finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
    };

export interface OpenAIProviderCallContext {
  readonly signal: AbortSignal;
}

export interface OpenAIProvider {
  readonly kind: OpenAIProviderKind;
  openStream(
    params: OpenAIStreamParams,
    context: OpenAIProviderCallContext,
  ): Promise<AsyncIterable<OpenAIStreamChunk>>;
}

export interface OpenAIRequestOptions {
  readonly maxTokens?: number;
  readonly thinkingLevel?: ThinkingLevel;
  readonly protocol?: OpenAIProviderKind;
  readonly baseUrl?: string;
  readonly apiKey?: string;
}
