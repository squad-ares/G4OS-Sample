import type { SessionId } from '@g4os/kernel';
import { DisposableBase } from '@g4os/kernel/disposable';
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
import { detectCapabilities } from './capabilities.ts';
import { mapConfig } from './config/mapper.ts';
import { applyPromptCache1hTtl } from './prompt-cache/cache-markers.ts';
import { StreamRunner, type StreamRunnerDeps } from './runner/stream-runner.ts';
import type { ClaudeCreateMessageParams, ClaudeProvider } from './types.ts';

export interface ClaudeAgentOptions {
  readonly enablePromptCache1h?: boolean;
  readonly logger?: Logger;
}

export class ClaudeAgent extends DisposableBase implements IAgent {
  readonly kind = 'claude';
  readonly capabilities: AgentCapabilities;

  private readonly log: Logger;
  private readonly enablePromptCache1h: boolean;
  private readonly activeControllers = new Map<SessionId, AbortController>();

  constructor(
    _config: AgentConfig,
    private readonly provider: ClaudeProvider,
    options: ClaudeAgentOptions = {},
  ) {
    super();
    this.capabilities = detectCapabilities(_config.modelId);
    this.log = options.logger ?? createLogger('claude-agent');
    this.enablePromptCache1h =
      options.enablePromptCache1h ??
      (this.provider.kind === 'direct' && this.capabilities.promptCaching);
  }

  run(input: AgentTurnInput): Observable<AgentEvent> {
    return new Observable<AgentEvent>((subscriber) => {
      const controller = this.linkController(input.sessionId);
      const runner = new StreamRunner(this.buildRunnerDeps(), {
        providerKind: this.provider.kind,
      });

      const pump = async (): Promise<void> => {
        try {
          for await (const event of runner.run(input, controller.signal)) {
            subscriber.next(event);
          }
          subscriber.complete();
        } catch (err) {
          subscriber.error(err);
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
    if (controller && !controller.signal.aborted) {
      this.log.info({ sessionId, kind: this.kind }, 'interrupting active turn');
      controller.abort();
    }
    return Promise.resolve(ok(undefined));
  }

  override dispose(): void {
    for (const controller of this.activeControllers.values()) {
      if (!controller.signal.aborted) controller.abort();
    }
    this.activeControllers.clear();
    super.dispose();
  }

  private buildRunnerDeps(): StreamRunnerDeps {
    return {
      provider: this.provider,
      buildParams: (input) => this.buildParams(input),
    };
  }

  private buildParams(input: AgentTurnInput): ClaudeCreateMessageParams {
    const base = mapConfig(input.config, input.messages);
    return this.enablePromptCache1h ? applyPromptCache1hTtl(base) : base;
  }

  private linkController(sessionId: SessionId): AbortController {
    const existing = this.activeControllers.get(sessionId);
    if (existing && !existing.signal.aborted) existing.abort();
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
