import type { Message, SessionId, ToolDefinition } from '@g4os/kernel';
import type { IDisposable } from '@g4os/kernel/disposable';
import type { AgentError } from '@g4os/kernel/errors';
import type { Result } from 'neverthrow';
import type { Observable } from 'rxjs';

export type AgentFamily = 'anthropic' | 'openai' | 'openai-compat' | 'google' | 'bedrock';

export type ThinkingLevel = 'low' | 'think' | 'high' | 'ultra';

export interface AgentCapabilities {
  readonly family: AgentFamily;
  readonly streaming: boolean;
  readonly thinking: boolean;
  readonly toolUse: boolean;
  readonly promptCaching: boolean;
  readonly maxContextTokens: number;
  readonly supportedTools: 'all' | readonly string[];
}

export interface AgentConfig {
  readonly connectionSlug: string;
  readonly modelId: string;
  readonly thinkingLevel?: ThinkingLevel;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly systemPrompt?: string;
  readonly tools?: readonly ToolDefinition[];
}

export interface AgentTurnInput {
  readonly sessionId: SessionId;
  readonly turnId: string;
  readonly messages: readonly Message[];
  readonly config: AgentConfig;
}

export type AgentDoneReason = 'stop' | 'max_tokens' | 'tool_use' | 'interrupted' | 'error';

export type AgentEvent =
  | { readonly type: 'started'; readonly turnId: string }
  | { readonly type: 'text_delta'; readonly text: string }
  | { readonly type: 'thinking_delta'; readonly text: string }
  | { readonly type: 'tool_use_start'; readonly toolUseId: string; readonly toolName: string }
  | { readonly type: 'tool_use_input_delta'; readonly toolUseId: string; readonly partial: string }
  | {
      readonly type: 'tool_use_complete';
      readonly toolUseId: string;
      readonly input: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: 'tool_result';
      readonly toolUseId: string;
      readonly result: unknown;
      readonly isError: boolean;
    }
  | {
      readonly type: 'usage';
      readonly input: number;
      readonly output: number;
      readonly cacheRead?: number;
      readonly cacheWrite?: number;
    }
  | { readonly type: 'done'; readonly reason: AgentDoneReason }
  | { readonly type: 'error'; readonly error: AgentError };

export type AgentEventType = AgentEvent['type'];

export interface IAgent extends IDisposable {
  readonly kind: string;
  readonly capabilities: AgentCapabilities;

  run(input: AgentTurnInput): Observable<AgentEvent>;
  interrupt(sessionId: SessionId): Promise<Result<void, AgentError>>;
}

export interface AgentFactory {
  readonly kind: string;
  supports(config: AgentConfig): boolean;
  create(config: AgentConfig): IAgent;
}
