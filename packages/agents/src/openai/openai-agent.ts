import type { SessionId } from '@g4os/kernel';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import type { AgentError } from '@g4os/kernel/errors';
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
import { wrapAgentError } from '../shared/errors/wrap-agent-error.ts';
import { buildPromptCacheKey } from './cache/prompt-cache-keys.ts';
import { detectCapabilities } from './capabilities.ts';
import { mapConfig } from './config/mapper.ts';
import { StreamRunner, type StreamRunnerDeps } from './runner/stream-runner.ts';
import type { OpenAIProvider, OpenAIStreamParams } from './types.ts';

export interface OpenAIAgentOptions {
  readonly workspaceId?: string;
  readonly connectionSlug: string;
  readonly logger?: Logger;
}

export class OpenAIAgent extends DisposableBase implements IAgent {
  readonly kind: string;
  readonly capabilities: AgentCapabilities;

  private readonly log: Logger;
  private readonly activeControllers = new Map<SessionId, AbortController>();

  constructor(
    private readonly config: AgentConfig,
    private readonly provider: OpenAIProvider,
    private readonly options: OpenAIAgentOptions,
  ) {
    super();
    this.kind = provider.kind === 'responses' ? 'openai-responses' : 'openai';
    this.capabilities = detectCapabilities(config.modelId);
    this.log = options.logger ?? createLogger('openai-agent');
    // Cleanup centralizado via _register (FIFO no DisposableStore):
    // abort PRIMEIRO, clear DEPOIS — caso contrário map vazio antes do abort.
    this._register(
      toDisposable(() => {
        for (const controller of this.activeControllers.values()) {
          if (!controller.signal.aborted) controller.abort();
        }
      }),
    );
    this._register(toDisposable(() => this.activeControllers.clear()));
  }

  run(input: AgentTurnInput): Observable<AgentEvent> {
    return new Observable<AgentEvent>((subscriber) => {
      const controller = this.linkController(input.sessionId);
      const runner = new StreamRunner(this.buildRunnerDeps());
      const pump = async (): Promise<void> => {
        try {
          for await (const event of runner.run(input, controller.signal)) {
            subscriber.next(event);
          }
          subscriber.complete();
        } catch (err) {
          // Alinhar com Google/Codex — emite `error` event + `done`
          // antes de complete, em vez de `subscriber.error()`. RxJS error
          // teardown cancela o observable cleanly mas quebra contract do
          // `AgentEvent` (caller espera done + complete em todo turn).
          subscriber.next({ type: 'error', error: wrapAgentError(err, 'openai') });
          subscriber.next({ type: 'done', reason: 'error' });
          subscriber.complete();
        } finally {
          this.releaseController(input.sessionId, controller);
        }
      };
      void pump();
      return () => {
        if (!controller.signal.aborted) controller.abort();
        this.releaseController(input.sessionId, controller);
      };
    });
  }

  interrupt(sessionId: SessionId): Promise<Result<void, AgentError>> {
    const controller = this.activeControllers.get(sessionId);
    if (controller !== undefined && !controller.signal.aborted) {
      this.log.info({ sessionId, kind: this.kind }, 'interrupting openai turn');
      controller.abort();
    }
    return Promise.resolve(ok(undefined));
  }

  // dispose() herdado de DisposableBase — executa LIFO os disposables
  // registrados no constructor.

  private buildRunnerDeps(): StreamRunnerDeps {
    return {
      provider: this.provider,
      buildParams: (input) => this.buildParams(input),
    };
  }

  private buildParams(input: AgentTurnInput): OpenAIStreamParams {
    const toolNames = (this.config.tools ?? []).map((t) => t.name);
    const promptCacheKey = this.capabilities.promptCaching
      ? buildPromptCacheKey({
          ...(this.options.workspaceId === undefined
            ? {}
            : { workspaceId: this.options.workspaceId }),
          connectionSlug: this.options.connectionSlug,
          toolNames,
        })
      : undefined;
    return mapConfig(
      input.config,
      input.messages,
      promptCacheKey === undefined ? {} : { promptCacheKey },
    );
  }

  private linkController(sessionId: SessionId): AbortController {
    const existing = this.activeControllers.get(sessionId);
    if (existing !== undefined && !existing.signal.aborted) existing.abort();
    const controller = new AbortController();
    this.activeControllers.set(sessionId, controller);
    return controller;
  }

  private releaseController(sessionId: SessionId, controller: AbortController): void {
    if (this.activeControllers.get(sessionId) === controller) {
      this.activeControllers.delete(sessionId);
    }
  }
}
