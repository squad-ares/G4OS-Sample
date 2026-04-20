import { randomUUID } from 'node:crypto';
import type { SessionId } from '@g4os/kernel';
import { DisposableBase } from '@g4os/kernel/disposable';
import { AgentError } from '@g4os/kernel/errors';
import { createLogger, type Logger } from '@g4os/kernel/logger';
import { ok, type Result } from 'neverthrow';
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
  }

  run(input: AgentTurnInput): Observable<AgentEvent> {
    return new Observable<AgentEvent>((subscriber) => {
      const requestId = this.requestIdFactory();
      this.activeRequests.set(input.sessionId, requestId);

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
          subscriber.complete();
          return;
        }
        const mapped = mapCodexEvent(event);
        if (!mapped) return;
        subscriber.next(mapped);
        if (mapped.type === 'done') subscriber.complete();
      };

      const offMessage = this.deps.appServer.on('message', handler);

      this.deps.appServer
        .send({
          type: 'run_turn',
          requestId,
          input: mapAgentInputToCodex(input),
        })
        .catch((err: unknown) => subscriber.error(err));

      return () => {
        offMessage();
        if (this.activeRequests.get(input.sessionId) === requestId) {
          this.activeRequests.delete(input.sessionId);
        }
        this.deps.appServer
          .send({ type: 'cancel', requestId })
          .catch((err: unknown) => this.log.warn({ err, requestId }, 'cancel send failed'));
      };
    });
  }

  interrupt(sessionId: SessionId): Promise<Result<void, AgentError>> {
    const requestId = this.activeRequests.get(sessionId);
    if (!requestId) return Promise.resolve(ok(undefined));
    this.log.info({ sessionId, requestId }, 'interrupting codex turn');
    this.activeRequests.delete(sessionId);
    return this.deps.appServer
      .send({ type: 'cancel', requestId })
      .then(() => ok<void, AgentError>(undefined))
      .catch((err: unknown) => {
        if (err instanceof AgentError) throw err;
        throw AgentError.network('codex', err);
      });
  }

  override dispose(): void {
    this.deps.bridgeMcp?.detach();
    this.deps.appServer.dispose();
    this.activeRequests.clear();
    super.dispose();
  }
}
