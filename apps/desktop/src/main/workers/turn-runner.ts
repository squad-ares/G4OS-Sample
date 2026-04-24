/**
 * TurnRunner (worker-side) — OUTLIER-11 Phase 2b.
 *
 * Executa um turno de agent dentro do session worker. Recebe a history
 * completa, config e credenciais via `dispatch` command; emite eventos
 * de streaming (`turn-stream`) e fecha com um `turn-complete` carregando
 * o payload acumulado para o main persistir.
 *
 * Diferente do `TurnDispatcher` em main:
 *  - Não acessa SQLite (persistência fica no main)
 *  - Não acessa vault (credenciais chegam no payload da `dispatch`)
 *  - Não mantém `SessionEventBus` (main re-emite via bridge)
 *
 * Um runner atende um sessionId — reentrância é rejeitada (erro
 * `worker.turn_in_progress`).
 */

import { type AgentEvent, AgentRegistry, type IAgent } from '@g4os/agents/interface';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import type { AppError } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import type { SessionId } from '@g4os/kernel/types';
import type { MainToWorkerDispatch, WorkerToMain, WorkerToMainTurnComplete } from './protocol.ts';

interface UnsubscribableLike {
  unsubscribe(): void;
}

interface ActiveTurn {
  readonly sessionId: SessionId;
  readonly turnId: string;
  readonly agent: IAgent;
  readonly subscription: UnsubscribableLike;
  readonly finalize: (reason: WorkerToMainTurnComplete['reason']) => void;
}

const log = createLogger('turn-runner');

export interface TurnRunnerDeps {
  readonly registry: AgentRegistry;
  readonly post: (msg: WorkerToMain) => void;
  readonly buildRegistry: (credentials: MainToWorkerDispatch['credentials']) => AgentRegistry;
}

export class WorkerTurnRunner extends DisposableBase {
  readonly #deps: TurnRunnerDeps;
  #registry: AgentRegistry;
  #active: ActiveTurn | null = null;

  constructor(deps: TurnRunnerDeps) {
    super();
    this.#deps = deps;
    this.#registry = deps.registry;
    this._register(
      toDisposable(() => {
        const active = this.#active;
        if (!active) return;
        active.subscription.unsubscribe();
        active.agent.dispose();
        this.#active = null;
      }),
    );
  }

  async dispatch(cmd: MainToWorkerDispatch): Promise<void> {
    if (this.#active) {
      this.emitError('worker.turn_in_progress', 'another turn is already running', cmd.turnId);
      return;
    }

    this.#registry = this.#deps.buildRegistry(cmd.credentials);

    const agentResult = this.#registry.create(cmd.config);
    if (agentResult.isErr()) {
      this.emitError(agentResult.error.code, agentResult.error.message, cmd.turnId);
      return;
    }

    this.emitStream({
      type: 'turn.started',
      sessionId: cmd.sessionId,
      turnId: cmd.turnId,
    });

    const textChunks: string[] = [];
    const thinkingChunks: string[] = [];
    let usageInput = 0;
    let usageOutput = 0;
    let finalReason: WorkerToMainTurnComplete['reason'] = 'stop';

    const agent = agentResult.value;
    const stream = agent.run({
      sessionId: cmd.sessionId,
      turnId: cmd.turnId,
      messages: cmd.messages,
      config: cmd.config,
    });

    await new Promise<void>((resolve) => {
      let settled = false;
      const finalize = (reason: WorkerToMainTurnComplete['reason']): void => {
        if (settled) return;
        settled = true;
        finalReason = reason;
        this.emitStream({
          type: 'turn.done',
          sessionId: cmd.sessionId,
          turnId: cmd.turnId,
          reason: finalReason,
        });
        this.#deps.post({
          type: 'turn-complete',
          sessionId: cmd.sessionId,
          turnId: cmd.turnId,
          reason: finalReason,
          text: textChunks.join(''),
          thinking: thinkingChunks.join(''),
          usage: { input: usageInput, output: usageOutput },
          modelId: cmd.config.modelId,
        });
        this.cleanup();
        agent.dispose();
        resolve();
      };

      const subscription = stream.subscribe({
        next: (event: AgentEvent) => {
          switch (event.type) {
            case 'text_delta':
              textChunks.push(event.text);
              this.emitStream({
                type: 'turn.text_chunk',
                sessionId: cmd.sessionId,
                turnId: cmd.turnId,
                text: event.text,
              });
              return;
            case 'thinking_delta':
              thinkingChunks.push(event.text);
              this.emitStream({
                type: 'turn.thinking_chunk',
                sessionId: cmd.sessionId,
                turnId: cmd.turnId,
                text: event.text,
              });
              return;
            case 'usage':
              usageInput = event.input;
              usageOutput = event.output;
              return;
            case 'done':
              finalReason = event.reason;
              return;
            case 'error':
              this.emitStream({
                type: 'turn.error',
                sessionId: cmd.sessionId,
                turnId: cmd.turnId,
                code: event.error.code,
                message: event.error.message,
              });
              return;
            default:
              return;
          }
        },
        error: (cause: unknown) => {
          const message = cause instanceof Error ? cause.message : String(cause);
          log.error(
            { err: cause, sessionId: cmd.sessionId, turnId: cmd.turnId },
            'agent stream errored',
          );
          this.emitStream({
            type: 'turn.error',
            sessionId: cmd.sessionId,
            turnId: cmd.turnId,
            code: 'agent.stream_error',
            message,
          });
          finalize('error');
        },
        complete: () => finalize(finalReason),
      });

      this.#active = {
        sessionId: cmd.sessionId,
        turnId: cmd.turnId,
        agent,
        subscription,
        finalize,
      };
    });
  }

  interrupt(turnId?: string): void {
    const active = this.#active;
    if (!active) return;
    if (turnId && active.turnId !== turnId) return;
    // `agent.interrupt(sessionId)` aborta o AbortController interno do
    // provider (claude/openai/google) — cancela o HTTP inflight do SDK,
    // não só a assinatura rxjs. `finalize('interrupted')` garante que o
    // Promise externo resolva e `turn-complete` saia mesmo que o provider
    // mocks ou bugs deixem de propagar erro de abort.
    active.subscription.unsubscribe();
    void active.agent.interrupt(active.sessionId);
    active.finalize('interrupted');
  }

  private cleanup(): void {
    this.#active = null;
  }

  private emitStream(event: {
    readonly type: string;
    readonly sessionId: string;
    readonly turnId: string;
    readonly [key: string]: unknown;
  }): void {
    this.#deps.post({ type: 'turn-stream', event });
  }

  private emitError(code: string, message: string, turnId: string): void {
    this.#deps.post({ type: 'error', code, message, turnId });
  }
}

/**
 * Helper factory exposto para facilitar mocking em tests — bootstrap real
 * usa este mesmo formato.
 */
export function createTurnRunner(deps: TurnRunnerDeps): WorkerTurnRunner {
  return new WorkerTurnRunner(deps);
}

/**
 * Cria um `AgentRegistry` vazio (ponto de extensão para tests). Em produção
 * o `session-worker` instancia direto com `new AgentRegistry()` e registra
 * factories conforme as credenciais recebidas em cada dispatch.
 */
export function emptyRegistry(): AgentRegistry {
  return new AgentRegistry();
}

export type WorkerDispatchInput = Pick<MainToWorkerDispatch, 'messages' | 'config'> & {
  readonly sessionId: SessionId;
  readonly turnId: string;
};

/**
 * Construtor de mensagem de erro para ramos em que o dispatch não chegou
 * a criar um turno — usado pelo worker entry quando o runner lança antes
 * de iniciar o stream.
 */
export function buildDispatchError(err: AppError, turnId: string): WorkerToMain {
  return { type: 'error', code: err.code, message: err.message, turnId };
}
