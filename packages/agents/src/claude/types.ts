import type { ThinkingLevel } from '../interface/agent.ts';

export type ClaudeProviderKind = 'direct' | 'bedrock' | 'compat';

export interface ClaudeCacheControl {
  readonly type: 'ephemeral';
  readonly ttl?: '5m' | '1h';
}

export type ClaudeContentBlockInput =
  | {
      readonly type: 'text';
      readonly text: string;
      readonly cache_control?: ClaudeCacheControl;
    }
  | {
      readonly type: 'tool_use';
      readonly id: string;
      readonly name: string;
      readonly input: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: 'tool_result';
      readonly tool_use_id: string;
      readonly content: string | readonly { readonly type: 'text'; readonly text: string }[];
      readonly is_error?: boolean;
    }
  | {
      readonly type: 'thinking';
      readonly thinking: string;
    };

export interface ClaudeMessage {
  readonly role: 'user' | 'assistant';
  readonly content: readonly ClaudeContentBlockInput[];
}

export interface ClaudeSystemBlock {
  readonly type: 'text';
  readonly text: string;
  readonly cache_control?: ClaudeCacheControl;
}

export interface ClaudeToolParam {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Readonly<Record<string, unknown>>;
  readonly cache_control?: ClaudeCacheControl;
}

export interface ClaudeThinkingConfig {
  readonly type: 'enabled';
  readonly budget_tokens: number;
}

export interface ClaudeCreateMessageParams {
  readonly model: string;
  readonly max_tokens: number;
  readonly system?: readonly ClaudeSystemBlock[];
  readonly messages: readonly ClaudeMessage[];
  readonly tools?: readonly ClaudeToolParam[];
  readonly temperature?: number;
  readonly thinking?: ClaudeThinkingConfig;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly stream: true;
}

export type ClaudeStreamEvent =
  | { readonly type: 'message_start'; readonly message: { readonly id: string } }
  | {
      readonly type: 'content_block_start';
      readonly index: number;
      readonly content_block:
        | { readonly type: 'text'; readonly text: string }
        | { readonly type: 'thinking'; readonly thinking: string }
        | {
            readonly type: 'tool_use';
            readonly id: string;
            readonly name: string;
            readonly input: Readonly<Record<string, unknown>>;
          };
    }
  | {
      readonly type: 'content_block_delta';
      readonly index: number;
      readonly delta:
        | { readonly type: 'text_delta'; readonly text: string }
        | { readonly type: 'thinking_delta'; readonly thinking: string }
        | { readonly type: 'input_json_delta'; readonly partial_json: string };
    }
  | { readonly type: 'content_block_stop'; readonly index: number }
  | {
      readonly type: 'message_delta';
      readonly delta: {
        readonly stop_reason?: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence';
      };
      readonly usage?: {
        readonly input_tokens?: number;
        readonly output_tokens?: number;
        readonly cache_read_input_tokens?: number;
        readonly cache_creation_input_tokens?: number;
      };
    }
  | { readonly type: 'message_stop' };

export interface ClaudeProviderCallContext {
  readonly signal: AbortSignal;
}

export interface ClaudeProvider {
  readonly kind: ClaudeProviderKind;
  createMessage(
    params: ClaudeCreateMessageParams,
    context: ClaudeProviderCallContext,
  ): Promise<AsyncIterable<ClaudeStreamEvent>>;
}

export interface ClaudeRequestOptions {
  readonly maxTokens: number;
  readonly thinkingBudget?: number;
  readonly thinkingLevel?: ThinkingLevel;
}
