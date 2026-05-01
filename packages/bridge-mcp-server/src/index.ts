/**
 * `@g4os/bridge-mcp-server` — re-expõe as session tools (`list_dir`,
 * `read_file`, `activate_sources`, etc.) como um MCP server stdio que
 * agents externos (CodexAgent via subprocess, IDE extension, headless
 * CLI) podem consumir.
 *
 * Estado: skeleton. Define o contrato + factory function. Implementação
 * real requer:
 *
 * 1. `pnpm add @modelcontextprotocol/sdk -w` (ou via catalog).
 * 2. Implementar `BridgeMcpServer` com `StdioServerTransport` do SDK.
 * 3. Cada tool exposta vira um handler que delega ao `ToolCatalog` do
 *    main process via IPC bridge (passing through permission broker).
 * 4. Auth do client via token efêmero único por session — bridge MCP
 *    não pode aceitar conexão de processo arbitrário do OS.
 *
 * Por que skeleton: bridge real depende de decisão arquitetural ainda
 * em aberto sobre o transport (stdio direto vs unix socket vs
 * websocket). ADR pendente. Estamos entregando o slot do package +
 * tipos pra que CodexAgent (que já tem `BridgeMcpConnector` skeleton)
 * tenha uma API canônica pra apontar.
 */

import { AppError, ErrorCode, type Result } from '@g4os/kernel/errors';
import { err } from 'neverthrow';

export interface BridgeMcpServerOptions {
  /** Token efêmero exigido em todas as conexões de client. */
  readonly authToken: string;
  /** Lista de tools expostas — namespace `bridge_<tool_name>`. */
  readonly tools: readonly BridgeMcpToolSpec[];
  /** Callback invocado quando o client chama uma tool. */
  readonly onToolCall: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<Result<unknown, AppError>>;
}

export interface BridgeMcpToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface BridgeMcpServerHandle {
  /** URL pra connector externo se conectar (ex.: `stdio://...` ou `ws://...`). */
  readonly url: string;
  /** Encerra o server e libera recursos (pipes/sockets). */
  dispose(): Promise<void>;
}

/**
 * Cria e inicia o bridge MCP server. Sem implementação real ainda —
 * retorna `Result.err` com sentinel pra caller tratar como "feature off".
 *
 * Quando promovido, esta function carrega o SDK MCP via dynamic import
 * e wire up o transport. CodexAgent já tem o connector skeleton em
 * `packages/agents/src/codex/bridge-mcp/connect.ts` — basta apontar pra
 * `handle.url` retornado aqui.
 */
export function startBridgeMcpServer(
  _options: BridgeMcpServerOptions,
): Promise<Result<BridgeMcpServerHandle, AppError>> {
  return Promise.resolve(
    err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message:
          'bridge-mcp-server: skeleton — implementação real depende de @modelcontextprotocol/sdk + ADR de transport',
      }),
    ),
  );
}
