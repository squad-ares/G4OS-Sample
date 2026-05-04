/**
 * Executor de uma iteração única do agent — converte o Observable<AgentEvent>
 * em Promise de resultado agregado. Reusado pelo tool-loop para rodar o agente
 * múltiplas vezes com messages atualizadas a cada rodada de tool use.
 *
 * Emite os eventos transientes (text_chunk/thinking_chunk/tool_use_started)
 * no bus durante a iteração; acumula texto/thinking/tool_uses para retornar.
 */

import type { AgentConfig, AgentDoneReason, IAgent } from '@g4os/agents/interface';
import { batchTextDeltas, dropIfBackpressured } from '@g4os/agents/streaming';
import type { AppError } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import type { Message, SessionId } from '@g4os/kernel/types';
import type { TurnTelemetry } from '@g4os/observability/metrics';
import { ok, type Result } from 'neverthrow';
import type { SessionEventBus } from './session-event-bus.ts';

const log = createLogger('session-runtime:turn-runner');

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
    // F-CR51-7: aplica streaming operators antes de subscrever.
    // `batchTextDeltas(16ms)` coalescenha text_delta em janelas de 16ms
    // para reduzir eventos IPC de 1:1 para N:1 (60fps drain no renderer).
    // `dropIfBackpressured(100)` protege o bus quando o renderer não drena
    // rápido o suficiente — evita OOM em gerações longas. ADR-0070.
    const raw = agent.run({ sessionId, turnId, messages, config });
    const obs = raw.pipe(batchTextDeltas(16), dropIfBackpressured(100));
    // Cleanup ativo via flag + unsubscribe explícito em error/complete.
    // Antes, o subscription permanecia "subscribed" até GC mesmo após
    // resolver — caller que retém via `onSubscription` callback podia
    // chamar `unsubscribe()` num subscription completed (no-op) ou pior,
    // segurar referência viva impedindo GC do agent inteiro.
    let settled = false;
    const settle = (result: Result<AgentIterationResult, AppError>): void => {
      if (settled) return;
      settled = true;
      try {
        subscription?.unsubscribe();
      } catch {
        // best-effort
      }
      resolve(result);
    };
    let subscription: UnsubscribableLike | undefined;
    subscription = obs.subscribe({
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
            // Apenas registra o placeholder — NÃO emitimos `turn.tool_use_started`
            // aqui porque o input ainda não foi acumulado (provider entrega
            // via stream delta até `tool_use_complete`). Emitir com `inputJson: ''`
            // engana o renderer. Evento é emitido em `tool_use_complete` com
            // o input real.
            toolUses.push({
              toolUseId: event.toolUseId,
              toolName: event.toolName,
              input: {},
            });
            break;
          case 'tool_use_complete': {
            const idx = toolUses.findIndex((t) => t.toolUseId === event.toolUseId);
            let finalEntry: CapturedToolUse;
            if (idx >= 0) {
              const existing = toolUses[idx];
              finalEntry = existing
                ? { ...existing, input: event.input }
                : {
                    toolUseId: event.toolUseId,
                    toolName: 'unknown',
                    input: event.input,
                  };
              toolUses[idx] = finalEntry;
            } else {
              // CR-18 F-SR5: branch defensivo — `tool_use_complete` sem
              // `tool_use_start` precedente cria entrada com `toolName:'unknown'`.
              // Tecnicamente impossível com providers atuais, mas log.warn
              // sinaliza regressão de provider sem perder o tool result.
              log.warn(
                { toolUseId: event.toolUseId, sessionId, turnId },
                'tool_use_complete without preceding tool_use_start; toolName=unknown',
              );
              finalEntry = {
                toolUseId: event.toolUseId,
                toolName: 'unknown',
                input: event.input,
              };
              toolUses.push(finalEntry);
            }
            // Agora sim — input real acumulado → renderer pode mostrar o card
            // com preview significativo antes do modal de permissão aparecer.
            eventBus.emit(sessionId, {
              type: 'turn.tool_use_started',
              sessionId,
              turnId,
              toolUseId: finalEntry.toolUseId,
              toolName: finalEntry.toolName,
              inputJson: safeStringify(finalEntry.input),
            });
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
          case 'started':
            // Notificação de início — sem side-effect. `done` final fecha o turn;
            // start é informativo para o agent log mas não afeta o tool loop.
            break;
          case 'tool_use_input_delta':
            // Stream parcial do input de uma tool use. Agregamos até
            // `tool_use_complete`, que entrega o input final acumulado.
            // Renderer pode receber preview via tool_use_started — mas só
            // emitimos esse evento em complete (input estável).
            break;
          case 'tool_result':
            // Tool result que o agent reporta. No fluxo V2 a execução de
            // tool é externa ao agent (TurnDispatcher → tool-loop), então
            // este branch é defensivo: se algum provider futuro emitir
            // resultado próprio, ignoramos para não duplicar persistência.
            break;
          default: {
            // Forçando exhaustiveness check em compile-time. Se um
            // novo `AgentEvent` tipo for adicionado em `@g4os/agents/interface`
            // sem atualizar este switch, TS quebra aqui no `_exhaustive: never`.
            const _exhaustive: never = event;
            void _exhaustive;
            break;
          }
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
        // Retorna ok com doneReason='error' para que tool-loop possa
        // persistir o texto parcial acumulado via finalizeAssistantMessage,
        // evitando perda de dados quando o stream falha após chunks visíveis.
        settle(
          ok({
            textChunks,
            thinkingChunks,
            usage: { input: usageInput, output: usageOutput },
            toolUses,
            doneReason: 'error' as AgentDoneReason,
          }),
        );
      },
      complete: () => {
        settle(
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

    // F-CR46-8: guarda settled antes de expor a subscription. Se o Observable
    // completou/errou sincronamente durante `obs.subscribe(...)`, `settle` já
    // foi chamado antes desta linha — não tem sentido entregar a subscription
    // ao caller nesse caso (já está completa e seria no-op ao unsubscribe).
    if (subscription && !settled) onSubscription?.(subscription);
  });
}

function safeStringify(value: Readonly<Record<string, unknown>>): string {
  try {
    return JSON.stringify(value);
  } catch (err) {
    // F-CR46-6: loga warn em vez de engolir o erro silenciosamente. Retorna
    // marcador distinto para o renderer distinguir "input vazio legítimo" de
    // "falha de serialização" (referência cíclica, BigInt, etc.).
    log.warn({ err, type: typeof value }, 'tool input não serializável em JSON; preview vazio');
    return '{"_error":"non_serializable"}';
  }
}
