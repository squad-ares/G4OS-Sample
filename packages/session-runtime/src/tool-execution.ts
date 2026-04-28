/**
 * Executa o conjunto de tool_use blocks capturado em uma iteração do
 * tool-loop. Cada tool passa pelo `PermissionBroker` + `ToolCatalog` e
 * emite `turn.tool_use_completed` no bus.
 */

import type { ToolCatalog, ToolHandlerResult } from '@g4os/agents/tools';
import { createLogger } from '@g4os/kernel/logger';
import type { SessionId } from '@g4os/kernel/types';
import { withSpan } from '@g4os/observability';
import type { PermissionBroker, PermissionDecision } from '@g4os/permissions';
import type { SessionEventBus } from './session-event-bus.ts';
import type { CapturedToolUse } from './turn-runner.ts';

const log = createLogger('tool-execution');

/**
 * Timeout default para execução individual de tool. Tool handler hung trava
 * o turn — `MAX_ITERATIONS` no tool-loop protege contra loop infinito mas
 * não contra hang. CR4-19.
 */
const DEFAULT_TOOL_TIMEOUT_MS = 60_000;

export interface ToolOutcome {
  readonly toolUseId: string;
  readonly toolName: string;
  readonly isError: boolean;
  readonly content: string;
}

export interface ExecuteToolUsesDeps {
  readonly permissionBroker: PermissionBroker;
  readonly toolCatalog: ToolCatalog;
  readonly eventBus: SessionEventBus;
}

export interface ExecuteToolUsesCtx {
  readonly sessionId: SessionId;
  readonly turnId: string;
  readonly toolUses: readonly CapturedToolUse[];
  readonly workingDirectory: string;
  readonly signal: AbortSignal;
  readonly workspaceId?: string;
  /**
   * Timeout máximo por tool em ms. Default 60s. Em timeout, signal local
   * é abortado e tool retorna erro com `isError: true` para o agent (CR4-19).
   */
  readonly toolTimeoutMs?: number;
}

export async function executeToolUses(
  deps: ExecuteToolUsesDeps,
  ctx: ExecuteToolUsesCtx,
): Promise<readonly ToolOutcome[]> {
  const outcomes: ToolOutcome[] = [];
  for (const use of ctx.toolUses) {
    const outcome = await executeSingleTool(deps, {
      sessionId: ctx.sessionId,
      turnId: ctx.turnId,
      use,
      workingDirectory: ctx.workingDirectory,
      signal: ctx.signal,
      ...(ctx.workspaceId === undefined ? {} : { workspaceId: ctx.workspaceId }),
      ...(ctx.toolTimeoutMs === undefined ? {} : { toolTimeoutMs: ctx.toolTimeoutMs }),
    });
    outcomes.push(outcome);
    deps.eventBus.emit(ctx.sessionId, {
      type: 'turn.tool_use_completed',
      sessionId: ctx.sessionId,
      turnId: ctx.turnId,
      toolUseId: use.toolUseId,
      toolName: use.toolName,
      ok: !outcome.isError,
    });
  }
  return outcomes;
}

function executeSingleTool(
  deps: ExecuteToolUsesDeps,
  ctx: {
    readonly sessionId: SessionId;
    readonly turnId: string;
    readonly use: CapturedToolUse;
    readonly workingDirectory: string;
    readonly toolTimeoutMs?: number;
    readonly signal: AbortSignal;
    readonly workspaceId?: string;
  },
): Promise<ToolOutcome> {
  return withSpan(
    'tool.execute',
    {
      attributes: {
        'session.id': ctx.sessionId,
        'tool.name': ctx.use.toolName,
        'tool.use_id': ctx.use.toolUseId,
      },
    },
    () => executeSingleToolInternal(deps, ctx),
  );
}

async function executeSingleToolInternal(
  deps: ExecuteToolUsesDeps,
  ctx: {
    readonly sessionId: SessionId;
    readonly turnId: string;
    readonly use: CapturedToolUse;
    readonly workingDirectory: string;
    readonly signal: AbortSignal;
    readonly workspaceId?: string;
    readonly toolTimeoutMs?: number;
  },
): Promise<ToolOutcome> {
  const { use } = ctx;
  // CR7-10: AbortSignal precisa interromper a espera por permission. Sem
  // isso, turn cancelado durante modal pendurava `runToolLoop` até o
  // user clicar (ou timeout do broker). Race entre `signal.aborted` e
  // `broker.request` resolution: o que vier primeiro vence.
  // CR9: cleanup do listener registrado em ctx.signal quando requestPromise
  // ganha a race. Sem isso, o listener (`onAbort`) permanecia anexado ao
  // signal mesmo após decisão tomada — leak por tool execution acumula em
  // turns longos com múltiplas tool uses.
  let decision: PermissionDecision;
  let detachAbortListener: (() => void) | undefined;
  try {
    const requestPromise = deps.permissionBroker.request({
      sessionId: ctx.sessionId,
      turnId: ctx.turnId,
      toolUseId: use.toolUseId,
      toolName: use.toolName,
      input: use.input,
      ...(ctx.workspaceId === undefined ? {} : { workspaceId: ctx.workspaceId }),
    });
    const abortPromise = new Promise<PermissionDecision>((_, reject) => {
      if (ctx.signal.aborted) {
        reject(new DOMException('aborted', 'AbortError'));
        return;
      }
      const onAbort = (): void => {
        ctx.signal.removeEventListener('abort', onAbort);
        reject(new DOMException('aborted', 'AbortError'));
      };
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      detachAbortListener = (): void => {
        ctx.signal.removeEventListener('abort', onAbort);
      };
    });
    decision = await Promise.race([requestPromise, abortPromise]);
    // requestPromise venceu — limpa listener do abortPromise.
    detachAbortListener?.();
  } catch (error) {
    // abortPromise venceu — listener já foi removido pelo onAbort `once: true`.
    detachAbortListener = undefined;
    const message = error instanceof Error ? error.message : String(error);
    // Em abort, cancela explicitamente a request no broker para liberar
    // o pending Map. Sem isso, a entry persistia até o timeout interno.
    if (ctx.signal.aborted) {
      deps.permissionBroker.cancel(ctx.sessionId);
    }
    log.warn({ err: message, toolUseId: use.toolUseId }, 'permission request failed');
    return {
      toolUseId: use.toolUseId,
      toolName: use.toolName,
      isError: true,
      content: `Permission request failed: ${message}`,
    };
  }

  log.info({ toolUseId: use.toolUseId, toolName: use.toolName, decision }, 'permission decided');

  if (decision === 'deny') {
    return {
      toolUseId: use.toolUseId,
      toolName: use.toolName,
      isError: true,
      content: 'User denied permission for this tool call.',
    };
  }

  const handler = deps.toolCatalog.get(use.toolName);
  if (!handler) {
    log.warn({ toolName: use.toolName }, 'tool not registered in catalog');
    return {
      toolUseId: use.toolUseId,
      toolName: use.toolName,
      isError: true,
      content: `Tool not registered: ${use.toolName}`,
    };
  }

  // CR4-19: timeout per-handler. Cria signal composto que aborta no
  // primeiro de: parent abort (turn cancel) ou timeout. Em timeout
  // retornamos tool result com isError para o agent reportar ao usuário
  // de forma estruturada em vez de hang.
  const timeoutMs = ctx.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  const timeoutController = new AbortController();
  const timeoutHandle = setTimeout(() => timeoutController.abort(), timeoutMs);
  timeoutHandle.unref?.();
  const composite = AbortSignal.any([ctx.signal, timeoutController.signal]);

  let handlerResult: ToolHandlerResult;
  try {
    handlerResult = await handler.execute(use.input, {
      sessionId: ctx.sessionId,
      turnId: ctx.turnId,
      toolUseId: use.toolUseId,
      workingDirectory: ctx.workingDirectory,
      signal: composite,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (timeoutController.signal.aborted && !ctx.signal.aborted) {
    log.warn({ toolName: use.toolName, timeoutMs }, 'tool handler timed out');
    return {
      toolUseId: use.toolUseId,
      toolName: use.toolName,
      isError: true,
      content: `Tool execution timed out after ${timeoutMs}ms`,
    };
  }

  if (handlerResult.isErr()) {
    log.warn(
      { toolName: use.toolName, err: handlerResult.error.message },
      'tool handler returned error',
    );
    return {
      toolUseId: use.toolUseId,
      toolName: use.toolName,
      isError: true,
      content: handlerResult.error.message,
    };
  }
  log.info(
    { toolName: use.toolName, outputLength: handlerResult.value.output.length },
    'tool handler succeeded',
  );
  return {
    toolUseId: use.toolUseId,
    toolName: use.toolName,
    isError: false,
    content: handlerResult.value.output,
  };
}
