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
 * 1. `pnpm add @modelcontextprotocol/sdk -w` (ou via catalog).
 * 2. Wire das resources/tools sobre `@g4os/data/events`
 *    (`SessionEventStore`) e `@g4os/data/messages`.
 * 3. Auth via mesmo token efêmero do bridge-mcp-server (decisão única
 *    em ADR de transport pendente).
 *
 * Por que skeleton: como bridge-mcp-server, depende do SDK MCP +
 * decisão de transport. Mas as resources/tools expostas já podem ser
 * declaradas — fixar a surface area facilita o IDE extension paralelo.
 */

import { AppError, ErrorCode, type Result } from '@g4os/kernel/errors';
import { err } from 'neverthrow';

export interface SessionMcpServerOptions {
  /** Token efêmero (compartilhado com bridge-mcp-server). */
  readonly authToken: string;
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
  }): Promise<Result<readonly SessionEventView[], AppError>>;
  listMessages(): Promise<Result<readonly SessionMessageView[], AppError>>;
  getMetadata(): Promise<Result<SessionMetadataView, AppError>>;
}

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
  readonly provider?: string;
  readonly modelId?: string;
}

export interface SessionMcpServerHandle {
  /** URL pra connector externo se conectar. */
  readonly url: string;
  /** Encerra o server e libera recursos. */
  dispose(): Promise<void>;
}

/**
 * Lista canônica de tools/resources expostas no MCP. Usada por consumers
 * (IDE extension, headless CLI) pra negociar capabilities sem precisar
 * spawnar o server primeiro.
 */
export const SESSION_MCP_TOOLS = [
  {
    name: 'session_list_events',
    description: 'List session events (after sequence, limit). Returns SessionEventView[].',
  },
  {
    name: 'session_list_messages',
    description: 'List session messages with role/content/timestamps.',
  },
  {
    name: 'session_get_metadata',
    description: 'Get session metadata (id, workspaceId, name, provider, modelId).',
  },
] as const;

export function startSessionMcpServer(
  _options: SessionMcpServerOptions,
): Promise<Result<SessionMcpServerHandle, AppError>> {
  return Promise.resolve(
    err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message:
          'session-mcp-server: skeleton — implementação real depende de @modelcontextprotocol/sdk + ADR de transport (compartilhada com bridge-mcp-server)',
      }),
    ),
  );
}
