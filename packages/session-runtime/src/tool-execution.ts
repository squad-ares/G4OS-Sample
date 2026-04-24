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
  },
): Promise<ToolOutcome> {
  const { use } = ctx;
  let decision: PermissionDecision;
  try {
    decision = await deps.permissionBroker.request({
      sessionId: ctx.sessionId,
      turnId: ctx.turnId,
      toolUseId: use.toolUseId,
      toolName: use.toolName,
      input: use.input,
      ...(ctx.workspaceId === undefined ? {} : { workspaceId: ctx.workspaceId }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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

  const handlerResult: ToolHandlerResult = await handler.execute(use.input, {
    sessionId: ctx.sessionId,
    turnId: ctx.turnId,
    toolUseId: use.toolUseId,
    workingDirectory: ctx.workingDirectory,
    signal: ctx.signal,
  });

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
