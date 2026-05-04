/**
 * `@g4os/codex-types` — types sintéticos V2 do protocolo NDJSON do
 * Codex agent subprocess. **NÃO é 1:1 com o protocolo real do Codex CLI
 * app-server** (que usa JSON-RPC com 200+ tipos gerados por `codex
 * app-server generate-ts`). Este pacote define o contrato interno V2,
 * consumido exclusivamente por `@g4os/agents/codex` (skeleton placeholder).
 *
 * Wire format documentado em ADR-0072. Mantém aqui no core pra evitar
 * duplicar definições — `@g4os/agents/codex` consome via re-export e
 * futuros consumers (test harness, bridge MCP, observers de tracing)
 * importam diretamente.
 */

/**
 * Dialeto **wire-format** do thinking level enviado pro Codex CLI.
 *
 * NÃO é o mesmo enum que `ThinkingLevel` em `@g4os/agents/interface` (que cobre
 * `'low' | 'think' | 'high' | 'ultra'`). O mapeamento entre os dois acontece em
 * `@g4os/agents/codex/app-server/input-mapper.ts#THINKING_LEVEL_MAP`. Mantemos
 * tipos distintos para que adicionar um novo nível em `ThinkingLevel` quebre o
 * mapper em compile-time, evitando silent strip.
 */
export type CodexWireThinkingLevel = 'low' | 'medium' | 'high';

/**
 * Sub-schema mínimo para um JSON Schema de input de tool.
 * Permite narrowing compile-time sem requerer `@types/json-schema` como dep.
 * Fronteira de validação: consumer recebe isso como output do Codex CLI;
 * não há garantia runtime além do shape mínimo aqui declarado.
 */
export interface CodexToolInputSchema {
  readonly type: 'object';
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
  readonly [key: string]: unknown;
}

export interface CodexRunTurnInput {
  readonly instructions?: string;
  readonly messages: readonly CodexWireMessage[];
  readonly model?: string;
  /**
   * V2-synthetic: campo não reconhecido pelo Codex CLI real (que recebe
   * tools via bridge MCP server — ADR-0072). Mantido no protocolo V2 para
   * que `input-mapper.ts` possa passar tools enquanto o bridge MCP não está
   * wired. Quando o bridge MCP estiver ativo, este campo deve ser removido
   * e tools roteadas exclusivamente via `bridgeMcpUrl`.
   */
  readonly tools?: readonly CodexWireTool[];
  /**
   * Pós-mapeamento. Caller passa `AgentConfig.thinkingLevel` (interface) e o
   * input-mapper traduz pro dialeto wire abaixo. Ver `CodexWireThinkingLevel`.
   */
  readonly thinkingLevel?: CodexWireThinkingLevel;
}

export interface CodexWireMessage {
  /**
   * Mensagens com `role: 'system'` são intencionalmente excluídas deste
   * tipo — system prompts são roteados pelo campo `instructions` separado
   * em `CodexRunTurnInput`. `mapRole` em `input-mapper.ts` dropa silenciosamente
   * qualquer mensagem com role não coberto aqui.
   */
  readonly role: 'user' | 'assistant' | 'tool';
  readonly content: readonly CodexWireContentBlock[];
}

export type CodexWireContentBlock =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'tool_use';
      /**
       * F-CR34-5: padronizado para `toolUseId` (mesmo nome usado em
       * `tool_result` e nos eventos `tool_use_*` em `CodexResponseEvent`).
       * `input-mapper.ts` mapeia `block.toolUseId` → `toolUseId` aqui.
       */
      readonly toolUseId: string;
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
  readonly inputSchema: CodexToolInputSchema;
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

export type CodexRequest = CodexRunTurnRequest | CodexCancelRequest;

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
      /**
       * Input completo do tool call. Fronteira de validação externa: tipo
       * declarado como `unknown` para forçar narrowing no consumer. Não usar
       * `Readonly<Record<string, unknown>>` — aceita qualquer objeto sem
       * garantia de shape (ver ADR-0002 "unknown + narrowing é o caminho").
       */
      readonly input: unknown;
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

/**
 * Lista canônica de event types — fonte do decoder gate runtime em
 * `agents/codex/app-server/frame.ts`. `as const satisfies readonly
 * CodexResponseEventType[]` força compile-time check que o array cobre
 * exatamente a união `CodexResponseEvent['type']` — adicionar evento
 * novo na união sem atualizar essa lista (ou vice-versa) quebra o build
 * via `satisfies`. Pacote types-only friendly: array literal const é
 * compile-time data, zero runtime extra além do próprio Set construído
 * pelo consumer.
 *
 * CR-38 F-CR38-3: o gate manual em `frame.ts` (`new Set([...])` literal)
 * duplicava a união e drifted silenciosamente — frames novos adicionados
 * em `CodexResponseEvent` viravam `schema_error` no decoder em runtime
 * sem nenhum sinal compile-time. Constante canônica aqui elimina drift.
 */
export const CODEX_RESPONSE_EVENT_TYPES = [
  'ack',
  'turn_started',
  'text_delta',
  'thinking_delta',
  'tool_use_start',
  'tool_use_input_delta',
  'tool_use_complete',
  'usage',
  'turn_finished',
  'error',
] as const satisfies readonly CodexResponseEventType[];
