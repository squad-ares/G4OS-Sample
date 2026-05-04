/**
 * `@g4os/session-mcp-server` — re-expõe a sessão atual (eventos, mensagens,
 * tool calls, metadata) como um MCP server pra:
 *
 *   1. **Developer experience**: IDE extension lê estado da sessão via MCP
 *      pra mostrar trace de tool calls + permissões pendentes inline.
 *   2. **Meta-features**: agent secundário (subagent) acessa contexto da
 *      sessão pai sem precisar replicar o histórico.
 *   3. **Headless debug**: CLI dump do conteúdo da sessão pra anexar em
 *      bug reports sem precisar abrir a app.
 *
 * Estado: skeleton. Define o contrato + tools expostas. Implementação
 * real requer:
 *
 * 1. `pnpm add @modelcontextprotocol/sdk -w` (ou via catalog — ver
 *    `pnpm-workspace.yaml`, entrada `@modelcontextprotocol/sdk`).
 * 2. Wire das resources/tools sobre `@g4os/data/events`
 *    (`SessionEventStore`) e `@g4os/data/messages`.
 * 3. Auth via mesmo token efêmero do bridge-mcp-server (decisão única
 *    em ADR de transport pendente — ADR-NNNN).
 *
 * Por que skeleton: como bridge-mcp-server, depende do SDK MCP +
 * decisão de transport. Mas as resources/tools expostas já podem ser
 * declaradas — fixar a surface area facilita o IDE extension paralelo.
 *
 * Rastreado em: TASK-18-02 (`STUDY/Audit/Tasks/18-v1-parity-gaps/`).
 * ADR de transport: compartilhada com bridge-mcp-server (TASK-18-01).
 */

import type { IDisposable } from '@g4os/kernel/disposable';
import { AppError, ErrorCode, type Result } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { err, ok } from 'neverthrow';

const log = createLogger('session-mcp-server');

// ---------------------------------------------------------------------------
// Brand types
// ---------------------------------------------------------------------------

/**
 * Token de autenticação efêmero para o session MCP server.
 * Branded type — garante entropia mínima em compile time.
 * Usar `createEphemeralAuthToken()` para instanciar.
 */
export type EphemeralAuthToken = string & { readonly _brand: 'EphemeralAuthToken' };

/**
 * Cria um `EphemeralAuthToken` validando entropia mínima (≥ 32 chars hex).
 * Retorna `err(VALIDATION_ERROR)` se o token não satisfaz o requisito.
 */
export function createEphemeralAuthToken(raw: string): Result<EphemeralAuthToken, AppError> {
  if (!/^[0-9a-f]{32,}$/i.test(raw)) {
    return err(
      new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'EphemeralAuthToken deve ter ao menos 32 caracteres hexadecimais',
        context: { length: raw.length },
      }),
    );
  }
  return ok(raw as EphemeralAuthToken);
}

// ---------------------------------------------------------------------------
// Options + Adapter
// ---------------------------------------------------------------------------

export interface SessionMcpServerOptions {
  /** Token efêmero. Usar `createEphemeralAuthToken()` — branded type evita literal acidental. */
  readonly authToken: EphemeralAuthToken;
  /** ID da sessão exposta. Múltiplas sessões → múltiplos servers. */
  readonly sessionId: string;
  /**
   * Adapter pra acessar dados da sessão. Implementador real injeta
   * wrapper sobre `SessionEventStore` + `MessagesService`.
   */
  readonly adapter: SessionDataAdapter;
}

export interface SessionDataAdapter {
  listEvents(opts: {
    readonly afterSequence?: number;
    readonly limit?: number;
    /** Sinal de cancelamento — propagado em dispose/timeout/disconnect. */
    readonly signal?: AbortSignal;
  }): Promise<Result<readonly SessionEventView[], AppError>>;
  listMessages(opts: {
    /** Sinal de cancelamento — propagado em dispose/timeout/disconnect. */
    readonly signal?: AbortSignal;
  }): Promise<Result<readonly SessionMessageView[], AppError>>;
  getMetadata(opts: {
    /** Sinal de cancelamento — propagado em dispose/timeout/disconnect. */
    readonly signal?: AbortSignal;
  }): Promise<Result<SessionMetadataView, AppError>>;
}

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

export interface SessionEventView {
  readonly type: string;
  readonly sequenceNumber: number;
  readonly timestamp: number;
  readonly payload: Record<string, unknown>;
}

export interface SessionMessageView {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system' | 'tool';
  readonly content: unknown;
  readonly createdAt: number;
}

export interface SessionMetadataView {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: string;
  /**
   * `provider` e `modelId` usam `string | undefined` explícito (não `?:`)
   * pra compatibilidade com `exactOptionalPropertyTypes: true` — consumer
   * pode passar `{ provider: undefined }` sem erro de TS.
   */
  readonly provider: string | undefined;
  readonly modelId: string | undefined;
}

// ---------------------------------------------------------------------------
// Handle
// ---------------------------------------------------------------------------

/**
 * Handle do session MCP server.
 * Estende `IDisposable` (ADR-0012) — `dispose()` é **síncrono** e idempotente.
 *
 * Se o cleanup de pipes/sockets for assíncrono, o implementador dispara
 * fire-and-forget internamente e loga erros via `createLogger`. A Promise
 * interna pode ser exposta via `closed` se o consumer precisar aguardar o
 * flush completo antes de fechar o processo.
 */
export interface SessionMcpServerHandle extends IDisposable {
  /** URL pra connector externo se conectar. */
  readonly url: string;
  /**
   * Promise que resolve quando o cleanup async interno termina.
   * `dispose()` sinaliza intenção; `closed` é o ack do flush.
   */
  readonly closed: Promise<void>;
  /** Encerra o server e libera recursos (síncrono — conforme ADR-0012). */
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Tools catalog
// ---------------------------------------------------------------------------

/**
 * Spec de tool conforme protocolo MCP — `inputSchema` é obrigatório para
 * o handshake `tools/list` não quebrar em consumers com SDK real.
 */
export interface SessionMcpToolSpec {
  readonly name: string;
  readonly description: string;
  /**
   * Schema JSON da tool. Quando o skeleton for promovido, converter o
   * schema Zod via `z.toJSONSchema()` e remover o `{}` placeholder.
   */
  readonly inputSchema: Record<string, unknown>;
}

/**
 * Lista canônica de tools/resources expostas no MCP. Usada por consumers
 * (IDE extension, headless CLI) pra negociar capabilities sem precisar
 * spawnar o server primeiro.
 */
export const SESSION_MCP_TOOLS: readonly SessionMcpToolSpec[] = [
  {
    name: 'session_list_events',
    description: 'List session events (after sequence, limit). Returns SessionEventView[].',
    inputSchema: {
      type: 'object',
      properties: {
        afterSequence: {
          type: 'number',
          description: 'Retorna apenas eventos com sequenceNumber > afterSequence.',
        },
        limit: {
          type: 'number',
          description: 'Máximo de eventos a retornar. Default: 100.',
        },
      },
    },
  },
  {
    name: 'session_list_messages',
    description: 'List session messages with role/content/timestamps.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'session_get_metadata',
    description: 'Get session metadata (id, workspaceId, name, provider, modelId).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Guard + factory
// ---------------------------------------------------------------------------

/**
 * Retorna `true` se o session MCP server está habilitado (implementação real presente).
 * Usar como guard antes de montar `SessionMcpServerOptions` — evita custo de setup
 * (gerar token, montar adapter) só pra receber `err(FEATURE_DISABLED)`.
 *
 * Sempre retorna `false` no skeleton atual.
 */
export function isSessionMcpServerEnabled(): boolean {
  return false;
}

/**
 * Cria e inicia o session MCP server.
 *
 * Retorna `err(FEATURE_DISABLED)` enquanto skeleton — callers tratam como
 * "feature off" e exibem UI degradada. Não disparar Sentry para este código.
 *
 * Quando promovido:
 * - Carrega `@modelcontextprotocol/sdk` via dynamic import (lazy, sem dep em compile time).
 * - Wire up transport (stdio / unix socket / ws — ver ADR-NNNN).
 * - Implementa `dispose()` síncrono que sinaliza abort + dispara cleanup async interno.
 */
export function startSessionMcpServer(
  _options: SessionMcpServerOptions,
): Promise<Result<SessionMcpServerHandle, AppError>> {
  log.debug('startSessionMcpServer chamado em skeleton — retornando FEATURE_DISABLED');
  return Promise.resolve(
    err(
      new AppError({
        code: ErrorCode.FEATURE_DISABLED,
        message:
          'session-mcp-server: skeleton — implementação real depende de @modelcontextprotocol/sdk + ADR de transport (compartilhada com bridge-mcp-server)',
      }),
    ),
  );
}
