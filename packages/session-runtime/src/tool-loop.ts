/**
 * Tool-use loop do agent turn.
 *
 * Enquanto o agent sinalizar `doneReason === 'tool_use'`, executa cada tool
 * capturado via `PermissionBroker` + `ToolCatalog`, persiste a mensagem do
 * assistant (text + tool_use blocks) e a mensagem role=tool com os results,
 * e re-roda o agent com o histórico atualizado. Encerra em `stop` / `max_tokens`
 * / `interrupted` / `error`, ou em `MAX_ITERATIONS` como guarda.
 *
 * Helpers extraídos pra caber no cap 300 LOC/arquivo:
 *  - `tool-execution.ts` — permission broker + execução + emit `tool_use_completed`
 *  - `tool-persist.ts`   — persistência das mensagens assistant + role=tool
 */

import type { AgentConfig, IAgent } from '@g4os/agents/interface';
import type { ToolCatalog } from '@g4os/agents/tools';
import type { MessagesService } from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import type { Message, SessionId } from '@g4os/kernel/types';
import type { TurnTelemetry } from '@g4os/observability/metrics';
import type { PermissionBroker } from '@g4os/permissions';
import { err, type Result } from 'neverthrow';
import type { SessionEventBus } from './session-event-bus.ts';
import { executeToolUses } from './tool-execution.ts';
import { persistAssistantToolTurn, persistToolResultMessage } from './tool-persist.ts';
import { finalizeAssistantMessage } from './turn-finalize.ts';
import { runAgentIteration } from './turn-runner.ts';

const log = createLogger('tool-loop');

const MAX_ITERATIONS = 10;

export interface ToolLoopDeps {
  readonly messages: MessagesService;
  readonly eventBus: SessionEventBus;
  readonly permissionBroker: PermissionBroker;
  readonly toolCatalog: ToolCatalog;
}

export interface ToolLoopInput {
  readonly sessionId: SessionId;
  readonly turnId: string;
  readonly agent: IAgent;
  readonly initialMessages: readonly Message[];
  readonly config: AgentConfig;
  readonly workingDirectory: string;
  /** Opcional — quando fornecido, permite o broker consultar/persistir
   *  `allow_always` por workspace no `PermissionStore`. */
  readonly workspaceId?: string;
  readonly telemetry: TurnTelemetry;
  readonly signal: AbortSignal;
  readonly onSubscription?: (sub: { unsubscribe(): void }) => void;
}

export async function runToolLoop(
  deps: ToolLoopDeps,
  input: ToolLoopInput,
): Promise<Result<void, AppError>> {
  const state: LoopState = {
    allText: [],
    allThinking: [],
    totalUsageInput: 0,
    totalUsageOutput: 0,
    messages: [...input.initialMessages],
  };

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (input.signal.aborted) {
      return err(abortError(input.sessionId, input.turnId, iter));
    }
    const iterOutcome = await runOneIteration(deps, input, state, iter);
    if (iterOutcome.kind === 'error') return err(iterOutcome.error);
    if (iterOutcome.kind === 'done') return iterOutcome.result;
  }

  return err(
    new AppError({
      code: ErrorCode.AGENT_UNAVAILABLE,
      message: 'tool loop exceeded max iterations',
      context: { sessionId: input.sessionId, turnId: input.turnId, max: MAX_ITERATIONS },
    }),
  );
}

interface LoopState {
  allText: string[];
  allThinking: string[];
  totalUsageInput: number;
  totalUsageOutput: number;
  messages: Message[];
}

type IterationOutcome =
  | { readonly kind: 'continue' }
  | { readonly kind: 'done'; readonly result: Result<void, AppError> }
  | { readonly kind: 'error'; readonly error: AppError };

async function runOneIteration(
  deps: ToolLoopDeps,
  input: ToolLoopInput,
  state: LoopState,
  iter: number,
): Promise<IterationOutcome> {
  const iterResult = await runAgentIteration({
    sessionId: input.sessionId,
    turnId: input.turnId,
    agent: input.agent,
    config: input.config,
    messages: state.messages,
    eventBus: deps.eventBus,
    telemetry: input.telemetry,
    ...(input.onSubscription === undefined ? {} : { onSubscription: input.onSubscription }),
  });
  if (iterResult.isErr()) return { kind: 'error', error: iterResult.error };

  const { textChunks, thinkingChunks, usage, toolUses, doneReason } = iterResult.value;
  state.allText.push(...textChunks);
  state.allThinking.push(...thinkingChunks);
  state.totalUsageInput += usage.input;
  state.totalUsageOutput += usage.output;

  log.info(
    {
      sessionId: input.sessionId,
      turnId: input.turnId,
      iter,
      doneReason,
      toolUseCount: toolUses.length,
    },
    'iteration finished',
  );

  if (doneReason !== 'tool_use' || toolUses.length === 0) {
    input.telemetry.onDone(doneReason);
    return {
      kind: 'done',
      result: await finalizeAssistantMessage(
        { messages: deps.messages, eventBus: deps.eventBus },
        {
          sessionId: input.sessionId,
          turnId: input.turnId,
          textChunks: state.allText,
          thinkingChunks: state.allThinking,
          usageInput: state.totalUsageInput,
          usageOutput: state.totalUsageOutput,
          modelId: input.config.modelId,
        },
      ),
    };
  }

  const toolOutcomes = await executeToolUses(
    {
      permissionBroker: deps.permissionBroker,
      toolCatalog: deps.toolCatalog,
      eventBus: deps.eventBus,
    },
    {
      sessionId: input.sessionId,
      turnId: input.turnId,
      toolUses,
      workingDirectory: input.workingDirectory,
      signal: input.signal,
      ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
    },
  );

  const assistantPersisted = await persistAssistantToolTurn(
    { messages: deps.messages, eventBus: deps.eventBus },
    {
      sessionId: input.sessionId,
      textBuffered: textChunks.join(''),
      thinkingBuffered: thinkingChunks.join(''),
      toolUses,
      modelId: input.config.modelId,
    },
  );
  if (assistantPersisted.isErr()) return { kind: 'error', error: assistantPersisted.error };
  state.messages = [...state.messages, assistantPersisted.value];
  state.allText.length = 0;
  state.allThinking.length = 0;

  const toolMsgResult = await persistToolResultMessage(
    { messages: deps.messages, eventBus: deps.eventBus },
    {
      sessionId: input.sessionId,
      outcomes: toolOutcomes,
    },
  );
  if (toolMsgResult.isErr()) return { kind: 'error', error: toolMsgResult.error };
  state.messages = [...state.messages, toolMsgResult.value];

  return { kind: 'continue' };
}

function abortError(sessionId: string, turnId: string, iter: number): AppError {
  return new AppError({
    code: ErrorCode.AGENT_UNAVAILABLE,
    message: 'turn aborted',
    context: { sessionId, turnId, iter },
  });
}
