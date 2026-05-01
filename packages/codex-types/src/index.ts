/**
 * `@g4os/codex-types` — types compartilhados do protocolo NDJSON do
 * Codex CLI app-server. Migrado da V1.
 *
 * Wire format documentado em ADR-0072. Mantém aqui no core pra evitar
 * duplicar definições — `@g4os/agents/codex` consome via re-export e
 * futuros consumers (test harness, bridge MCP, observers de tracing)
 * importam diretamente.
 *
 * Pacote 100% type-only — não tem runtime, não tem deps. Build empty
 * (tsup gera só `.d.ts`).
 */

export interface CodexRunTurnInput {
  readonly instructions?: string;
  readonly messages: readonly CodexWireMessage[];
  readonly model?: string;
  readonly tools?: readonly CodexWireTool[];
  readonly thinkingLevel?: 'low' | 'medium' | 'high';
}

export interface CodexWireMessage {
  readonly role: 'user' | 'assistant' | 'tool';
  readonly content: readonly CodexWireContentBlock[];
}

export type CodexWireContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'tool_use';
      readonly id: string;
      readonly name: string;
      readonly input: unknown;
    }
  | {
      readonly type: 'tool_result';
      readonly toolUseId: string;
      readonly content: string;
      readonly isError?: boolean;
    };

export interface CodexWireTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface CodexRunTurnRequest {
  readonly type: 'run_turn';
  readonly requestId: string;
  readonly input: CodexRunTurnInput;
}

export interface CodexCancelRequest {
  readonly type: 'cancel';
  readonly requestId: string;
}

export interface CodexHandshakeRequest {
  readonly type: 'handshake';
  readonly requestId: string;
  readonly protocolVersion: number;
  readonly bridgeMcpUrl?: string;
}

export type CodexRequest = CodexRunTurnRequest | CodexCancelRequest | CodexHandshakeRequest;

export type CodexResponseEvent =
  | { readonly type: 'ack'; readonly requestId: string }
  | { readonly type: 'turn_started'; readonly requestId: string; readonly turnId: string }
  | {
      readonly type: 'text_delta';
      readonly requestId: string;
      readonly text: string;
    }
  | {
      readonly type: 'thinking_delta';
      readonly requestId: string;
      readonly text: string;
    }
  | {
      readonly type: 'tool_use_start';
      readonly requestId: string;
      readonly toolUseId: string;
      readonly toolName: string;
    }
  | {
      readonly type: 'tool_use_input_delta';
      readonly requestId: string;
      readonly toolUseId: string;
      readonly partial: string;
    }
  | {
      readonly type: 'tool_use_complete';
      readonly requestId: string;
      readonly toolUseId: string;
      readonly input: Readonly<Record<string, unknown>>;
    }
  | {
      readonly type: 'usage';
      readonly requestId: string;
      readonly inputTokens: number;
      readonly outputTokens: number;
      readonly cacheReadTokens?: number;
      readonly cacheWriteTokens?: number;
    }
  | {
      readonly type: 'turn_finished';
      readonly requestId: string;
      readonly stopReason: 'stop' | 'max_tokens' | 'tool_use' | 'interrupted' | 'error';
    }
  | {
      readonly type: 'error';
      readonly requestId: string;
      readonly code: 'rate_limited' | 'network' | 'invalid_input' | 'unavailable';
      readonly message: string;
    };

export type CodexResponseEventType = CodexResponseEvent['type'];

export interface CodexFrameEncoder {
  encode(message: CodexRequest): string;
}

export interface CodexFrameDecoder {
  decode(line: string): CodexResponseEvent | undefined;
}
