/**
 * `@g4os/bridge-mcp-server` — re-expõe as session tools (`list_dir`,
 * `read_file`, `activate_sources`, etc.) como um MCP server stdio que
 * agents externos (CodexAgent via subprocess, IDE extension, headless
 * CLI) podem consumir.
 *
 * Estado: skeleton. Define o contrato + factory function. Implementação
 * real requer:
 *
 * 1. Adicionar `@modelcontextprotocol/sdk` ao `pnpm-workspace.yaml`
 *    catalog (ADR-0153) e referenciar como `catalog:`.
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

import type { IDisposable } from '@g4os/kernel/disposable';
import { AppError, ErrorCode, type Result } from '@g4os/kernel/errors';
import { err, ok } from 'neverthrow';

/**
 * Token de autenticação efêmero para o bridge MCP.
 * Branded type — garante entropia mínima em compile time.
 * Usar `createBridgeAuthToken()` para instanciar.
 */
export type BridgeAuthToken = string & { readonly _brand: 'BridgeAuthToken' };

/**
 * Cria um `BridgeAuthToken` validando entropia mínima (≥ 32 chars hex).
 * Retorna `err(VALIDATION_ERROR)` se o token não satisfaz o requisito.
 */
export function createBridgeAuthToken(raw: string): Result<BridgeAuthToken, AppError> {
  if (!/^[0-9a-f]{32,}$/i.test(raw)) {
    return err(
      new AppError({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'BridgeAuthToken deve ter ao menos 32 caracteres hexadecimais',
        context: { length: raw.length },
      }),
    );
  }
  return ok(raw as BridgeAuthToken);
}

/**
 * URL tipada do bridge MCP. Aceita apenas prefixos de protocolo conhecidos
 * (`stdio://`, `unix://`, `ws://`) para que mudanças de transport causem erro
 * em compile time em vez de silently roubar conexões.
 */
export type BridgeMcpUrl = `stdio://${string}` | `unix://${string}` | `ws://${string}`;

/**
 * Contexto passado a `onToolCall` por invocação.
 * Todos os campos são obrigatórios — permission broker e audit log
 * dependem de sessionId/clientId/requestId para aplicar policies e
 * correlacionar entradas.
 */
export interface BridgeToolCallContext {
  /** Identificador da session que originou a conexão. */
  readonly sessionId: string;
  /** Identificador do agent externo que se conectou ao bridge. */
  readonly clientId: string;
  /** Correlation ID para tracing / audit log. */
  readonly requestId: string;
  /** Sinal de cancelamento — propagado em dispose(), timeout, disconnect. */
  readonly signal: AbortSignal;
}

export interface BridgeMcpServerOptions {
  /** Token efêmero de autenticação. Use `createBridgeAuthToken()`. */
  readonly authToken: BridgeAuthToken;
  /**
   * Lista de tools expostas — mínimo 1 elemento.
   * Bridge sem tools é no-op operacional: client conecta, vê 0 tools, desconecta.
   * `[BridgeMcpToolSpec, ...BridgeMcpToolSpec[]]` (NonEmptyArray) força isso em compile time.
   */
  readonly tools: readonly [BridgeMcpToolSpec, ...BridgeMcpToolSpec[]];
  /**
   * Callback invocado quando o client chama uma tool.
   * Recebe o contexto completo para permission broker e audit log.
   */
  readonly onToolCall: (
    name: string,
    args: Record<string, unknown>,
    ctx: BridgeToolCallContext,
  ) => Promise<Result<unknown, AppError>>;
}

export interface BridgeMcpToolSpec {
  readonly name: string;
  readonly description: string;
  /**
   * Schema Zod da tool. Convertido para JSON Schema internamente
   * ao expor via SDK MCP — evita drift entre Zod e JSON Schema cru.
   * Quando promover o skeleton, importar `z.toJSONSchema()` do zod.
   */
  readonly inputSchema: Record<string, unknown>;
  /**
   * Classificação da tool para o permission broker.
   * `read` → autoallow se workspace permita; `write`/`destructive` → sempre prompt.
   */
  readonly kind: 'read' | 'write' | 'destructive';
  /** Schema de saída opcional — para validação de resposta e introspection. */
  readonly outputSchema?: Record<string, unknown>;
}

/**
 * Handle do bridge MCP server.
 * Estende `IDisposable` (ADR-0012) — chamar `dispose()` é idempotente.
 * URL tipada com `BridgeMcpUrl` — mudanças de transport causam erro em compile time.
 */
export interface BridgeMcpServerHandle extends IDisposable {
  /** URL pra connector externo se conectar. */
  readonly url: BridgeMcpUrl;
  /** Timestamp de quando o server ficou pronto (ms desde epoch). */
  readonly attachedAt: number;
  /**
   * Encerra o server e libera recursos (pipes/sockets).
   * Idempotente — chamar 2x é no-op.
   */
  dispose(): void;
}

/**
 * Retorna `true` se o bridge MCP server está habilitado (implementação real presente).
 * Usar como guard antes de montar `BridgeMcpServerOptions` — evita custo de setup
 * (gerar token, listar tools, montar closure) só pra receber `err(FEATURE_DISABLED)`.
 *
 * Sempre retorna `false` no skeleton atual.
 */
export function isBridgeMcpServerEnabled(): boolean {
  return false;
}

/**
 * Cria e inicia o bridge MCP server.
 *
 * Retorna `err(FEATURE_DISABLED)` enquanto skeleton — callers tratam como
 * "feature off" e exibem UI degradada. Não disparar Sentry para este código.
 *
 * Quando promovido:
 * - Carrega `@modelcontextprotocol/sdk` via dynamic import (lazy, sem dep em compile time).
 * - Wire up `StdioServerTransport` + `Server`.
 * - CodexAgent aponta `handle.url` ao `BridgeMcpConnector.attach()`.
 *
 * Validação de unicidade: retorna `err(VALIDATION_ERROR)` se `options.tools`
 * contiver nomes duplicados.
 */
export function startBridgeMcpServer(
  options: BridgeMcpServerOptions,
): Promise<Result<BridgeMcpServerHandle, AppError>> {
  // Validação de unicidade de nomes antes de qualquer I/O.
  const names = new Set<string>();
  for (const tool of options.tools) {
    if (names.has(tool.name)) {
      return Promise.resolve(
        err(
          new AppError({
            code: ErrorCode.VALIDATION_ERROR,
            message: `bridge-mcp-server: tool name duplicado: "${tool.name}"`,
            context: { duplicate: tool.name },
          }),
        ),
      );
    }
    names.add(tool.name);
  }

  return Promise.resolve(
    err(
      new AppError({
        code: ErrorCode.FEATURE_DISABLED,
        message:
          'bridge-mcp-server: skeleton — implementação real depende de @modelcontextprotocol/sdk + ADR de transport',
      }),
    ),
  );
}
