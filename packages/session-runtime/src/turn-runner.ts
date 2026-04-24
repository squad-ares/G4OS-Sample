/**
 * Executor de uma iteração única do agent — converte o Observable<AgentEvent>
 * em Promise de resultado agregado. Reusado pelo tool-loop para rodar o agente
 * múltiplas vezes com messages atualizadas a cada rodada de tool use.
 *
 * Emite os eventos transientes (text_chunk/thinking_chunk/tool_use_started)
 * no bus durante a iteração; acumula texto/thinking/tool_uses para retornar.
 */

import type { AgentConfig, AgentDoneReason, IAgent } from '@g4os/agents/interface';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import type { Message, SessionId } from '@g4os/kernel/types';
import type { TurnTelemetry } from '@g4os/observability/metrics';
import { err, ok, type Result } from 'neverthrow';
import type { SessionEventBus } from './session-event-bus.ts';

interface UnsubscribableLike {
  unsubscribe(): void;
}

export interface CapturedToolUse {
  readonly toolUseId: string;
  readonly toolName: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export interface AgentIterationResult {
  readonly textChunks: readonly string[];
  readonly thinkingChunks: readonly string[];
  readonly usage: { readonly input: number; readonly output: number };
  readonly toolUses: readonly CapturedToolUse[];
  readonly doneReason: AgentDoneReason;
}

export interface AgentIterationInput {
  readonly sessionId: SessionId;
  readonly turnId: string;
  readonly agent: IAgent;
  readonly config: AgentConfig;
  readonly messages: readonly Message[];
  readonly eventBus: SessionEventBus;
  readonly telemetry: TurnTelemetry;
  readonly onSubscription?: (sub: UnsubscribableLike) => void;
}

export function runAgentIteration(
  input: AgentIterationInput,
): Promise<Result<AgentIterationResult, AppError>> {
  const { sessionId, turnId, agent, config, messages, eventBus, telemetry, onSubscription } = input;
  const textChunks: string[] = [];
  const thinkingChunks: string[] = [];
  const toolUses: CapturedToolUse[] = [];
  let usageInput = 0;
  let usageOutput = 0;
  let doneReason: AgentDoneReason = 'stop';

  return new Promise<Result<AgentIterationResult, AppError>>((resolve) => {
    const obs = agent.run({ sessionId, turnId, messages, config });
    const subscription = obs.subscribe({
      next: (event) => {
        switch (event.type) {
          case 'text_delta':
            textChunks.push(event.text);
            eventBus.emit(sessionId, {
              type: 'turn.text_chunk',
              sessionId,
              turnId,
              text: event.text,
            });
            break;
          case 'thinking_delta':
            thinkingChunks.push(event.text);
            eventBus.emit(sessionId, {
              type: 'turn.thinking_chunk',
              sessionId,
              turnId,
              text: event.text,
            });
            break;
          case 'tool_use_start':
            eventBus.emit(sessionId, {
              type: 'turn.tool_use_started',
              sessionId,
              turnId,
              toolUseId: event.toolUseId,
              toolName: event.toolName,
              inputJson: '',
            });
            toolUses.push({
              toolUseId: event.toolUseId,
              toolName: event.toolName,
              input: {},
            });
            break;
          case 'tool_use_complete': {
            const idx = toolUses.findIndex((t) => t.toolUseId === event.toolUseId);
            if (idx >= 0) {
              const existing = toolUses[idx];
              if (existing) {
                toolUses[idx] = { ...existing, input: event.input };
              }
            } else {
              toolUses.push({
                toolUseId: event.toolUseId,
                toolName: 'unknown',
                input: event.input,
              });
            }
            break;
          }
          case 'usage':
            usageInput = event.input;
            usageOutput = event.output;
            telemetry.onUsage({ input: event.input, output: event.output });
            break;
          case 'done':
            doneReason = event.reason;
            break;
          case 'error':
            eventBus.emit(sessionId, {
              type: 'turn.error',
              sessionId,
              turnId,
              code: event.error.code,
              message: event.error.message,
            });
            break;
          default:
            break;
        }
      },
      error: (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        telemetry.onError('agent.stream_error');
        eventBus.emit(sessionId, {
          type: 'turn.error',
          sessionId,
          turnId,
          code: 'agent.stream_error',
          message,
        });
        resolve(
          err(
            new AppError({
              code: ErrorCode.AGENT_UNAVAILABLE,
              message,
              context: { sessionId, turnId },
            }),
          ),
        );
      },
      complete: () => {
        resolve(
          ok({
            textChunks,
            thinkingChunks,
            usage: { input: usageInput, output: usageOutput },
            toolUses,
            doneReason,
          }),
        );
      },
    });

    onSubscription?.(subscription);
  });
}
