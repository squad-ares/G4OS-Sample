import { randomUUID } from 'node:crypto';
import type { SessionId } from '@g4os/kernel';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { AgentError } from '@g4os/kernel/errors';
import { createLogger, type Logger } from '@g4os/kernel/logger';
import { err, ok, type Result } from 'neverthrow';
import { Observable } from 'rxjs';
import type {
  AgentCapabilities,
  AgentConfig,
  AgentEvent,
  AgentTurnInput,
  IAgent,
} from '../interface/agent.ts';
import type { AppServerClient } from './app-server/client.ts';
import { mapCodexEvent } from './app-server/event-mapper.ts';
import { mapAgentInputToCodex } from './app-server/input-mapper.ts';
import type { CodexResponseEvent } from './app-server/protocol.ts';
import type { BridgeMcpConnector } from './bridge-mcp/connect.ts';

export interface CodexAgentOptions {
  readonly appServer: AppServerClient;
  readonly bridgeMcp?: BridgeMcpConnector;
  readonly logger?: Logger;
  readonly requestIdFactory?: () => string;
}

const DEFAULT_CAPABILITIES: AgentCapabilities = {
  family: 'openai-compat',
  streaming: true,
  thinking: true,
  toolUse: true,
  promptCaching: false,
  maxContextTokens: 128_000,
  supportedTools: 'all',
};

export class CodexAgent extends DisposableBase implements IAgent {
  readonly kind = 'codex';
  readonly capabilities: AgentCapabilities = DEFAULT_CAPABILITIES;

  private readonly log: Logger;
  private readonly requestIdFactory: () => string;
  private readonly activeRequests = new Map<SessionId, string>();

  constructor(
    _config: AgentConfig,
    private readonly deps: CodexAgentOptions,
  ) {
    super();
    this.log = deps.logger ?? createLogger('codex-agent');
    this.requestIdFactory = deps.requestIdFactory ?? (() => randomUUID());
    void _config;
    // Ordem determinística de teardown: bridge detacha PRIMEIRO (corta
    // canal MCP), depois subprocess é morto (NDJSON inflight é descartado
    // de forma segura porque não tem mais consumers), por fim limpa
    // estado in-memory. CR-18 F-AG1: `DisposableStore` itera em ORDEM DE
    // INSERÇÃO (FIFO via `Set`), não LIFO — o comentário antigo estava
    // invertido. Registramos `bridge` PRIMEIRO, `appServer.dispose` SEGUNDO,
    // `clear` POR ÚLTIMO para o run order match a documentação.
    if (this.deps.bridgeMcp) {
      const bridge = this.deps.bridgeMcp;
      this._register(toDisposable(() => bridge.detach()));
    }
    this._register(toDisposable(() => this.deps.appServer.dispose()));
    this._register(toDisposable(() => this.activeRequests.clear()));
  }

  run(input: AgentTurnInput): Observable<AgentEvent> {
    return new Observable<AgentEvent>((subscriber) => {
      // ADR-0072 / F-CR31-5: cancela turn anterior em re-run para a mesma
      // sessão. Sem isso, dois turns rápidos deixam o primeiro rodando no
      // subprocess consumindo tokens, enquanto a UI só recebe o segundo.
      const previousRequestId = this.activeRequests.get(input.sessionId);
      if (previousRequestId !== undefined) {
        this.deps.appServer
          .send({ type: 'cancel', requestId: previousRequestId })
          .catch((err: unknown) =>
            this.log.warn({ err, requestId: previousRequestId }, 'cancel previous turn failed'),
          );
      }
      const requestId = this.requestIdFactory();
      this.activeRequests.set(input.sessionId, requestId);
      // CR-34 F-CR34-4: marca turn finalizado pelo lado Codex (`done` natural ou
      // `error`) para evitar enviar `cancel` no teardown subsequente. Sem este
      // flag, todo turn bem-sucedido gerava NDJSON spurious + log warn falso-
      // positivo (`cancel send failed`) quando o subprocess fechava em paralelo.
      let completed = false;

      const handler = (event: CodexResponseEvent): void => {
        if (event.requestId !== requestId) return;
        if (event.type === 'error') {
          subscriber.next({
            type: 'error',
            error: AgentError.network('codex', {
              code: event.code,
              message: event.message,
            }),
          });
          subscriber.next({ type: 'done', reason: 'error' });
          completed = true;
          subscriber.complete();
          return;
        }
        const mapped = mapCodexEvent(event);
        if (!mapped) return;
        subscriber.next(mapped);
        if (mapped.type === 'done') {
          completed = true;
          subscriber.complete();
        }
      };

      // ADR-0072: se subprocess crashar mid-turn (OOM, sinal externo),
      // AppServerClient emite 'exit' mas o Observable ficaria pendurado
      // indefinidamente sem este listener. Só finaliza se o turno ainda
      // não completou via handler normal.
      const offExit = this.deps.appServer.on(
        'exit',
        ({ code, signal }: { code: number | null; signal: string | null }) => {
          if (completed) return;
          completed = true;
          subscriber.next({
            type: 'error',
            error: AgentError.network('codex', {
              reason: 'subprocess_exit',
              code,
              signal,
            }),
          });
          subscriber.next({ type: 'done', reason: 'error' });
          subscriber.complete();
        },
      );

      const offMessage = this.deps.appServer.on('message', handler);

      this.deps.appServer
        .send({
          type: 'run_turn',
          requestId,
          input: mapAgentInputToCodex(input),
        })
        .catch((sendErr: unknown) => {
          // ADR-0070 / ADR-0072 / F-CR31-9: emitir error + done + complete
          // em vez de subscriber.error(), que faz teardown sem `done` e
          // quebra o contrato AgentEvent. runToolLoop espera done:error para
          // finalizar a assistant message no event store.
          if (completed) return;
          completed = true;
          const agentErr =
            sendErr instanceof AgentError
              ? sendErr
              : AgentError.network('codex', { cause: sendErr });
          subscriber.next({ type: 'error', error: agentErr });
          subscriber.next({ type: 'done', reason: 'error' });
          subscriber.complete();
        });

      return () => {
        offMessage();
        offExit();
        if (this.activeRequests.get(input.sessionId) === requestId) {
          this.activeRequests.delete(input.sessionId);
        }
        // Após `done`/`error` natural, Codex já fechou a request — enviar
        // cancel gera tráfego NDJSON sem efeito + log warn ruidoso quando o
        // subprocess está em teardown. Só cancela em unsubscribe externo
        // (interrupt explícito, settle do turn-runner, dispose do agent).
        if (!completed) {
          this.deps.appServer
            .send({ type: 'cancel', requestId })
            .catch((err: unknown) => this.log.warn({ err, requestId }, 'cancel send failed'));
        }
      };
    });
  }

  interrupt(sessionId: SessionId): Promise<Result<void, AgentError>> {
    const requestId = this.activeRequests.get(sessionId);
    if (!requestId) return Promise.resolve(ok(undefined));
    this.log.info({ sessionId, requestId }, 'interrupting codex turn');
    this.activeRequests.delete(sessionId);
    // CR-32 F-CR32-1: respeita o contrato `Result<void, AgentError>` da
    // IAgent.interrupt. Antes o `.catch` lançava — caller idiomático
    // (`void agent.interrupt(...)` no TurnDispatcher) gerava
    // unhandledRejection quando subprocess Codex morto recusava o cancel.
    // Sibling agents (Claude/OpenAI/Google) já abortam in-process e
    // sempre retornam `ok`; Codex precisa do round-trip NDJSON, então
    // mapeamos falha como `err(...)` em vez de throw.
    return this.deps.appServer
      .send({ type: 'cancel', requestId })
      .then(() => ok<void, AgentError>(undefined))
      .catch((cause: unknown) => {
        const error = cause instanceof AgentError ? cause : AgentError.network('codex', cause);
        this.log.warn({ err: error, sessionId, requestId }, 'codex cancel send failed');
        return err<void, AgentError>(error);
      });
  }

  // dispose() é herdado de DisposableBase — `DisposableStore` itera o `Set`
  // em ORDEM DE INSERÇÃO (FIFO), então a sequência efetiva é
  // bridge.detach → appServer.dispose → activeRequests.clear, casando com a
  // documentação do constructor. CR-22 F-CR22-4: comentário antigo dizia
  // "LIFO" e listava a ordem invertida — sobreviveu ao fix CR-18 F-AG1 e
  // induzia leitor a assumir LIFO incorretamente.
}
