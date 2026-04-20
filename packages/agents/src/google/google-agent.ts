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
import { detectGeminiCapabilities } from './capabilities.ts';
import { StreamRunner } from './runner/stream-runner.ts';
import type { GeminiProvider, GeminiTurnStrategy } from './types.ts';

export interface GoogleAgentOptions {
  readonly logger?: Logger;
  readonly enableNativeRouting?: boolean;
}

export class GoogleAgent extends DisposableBase implements IAgent {
  readonly kind = 'google';
  readonly capabilities: AgentCapabilities;

  private readonly log: Logger;
  private readonly runner: StreamRunner;
  private readonly activeControllers = new Map<SessionId, AbortController>();

  constructor(
    private readonly config: AgentConfig,
    private readonly provider: GeminiProvider,
    private readonly options: GoogleAgentOptions = {},
  ) {
    super();
    this.capabilities = detectGeminiCapabilities(config.modelId);
    this.log = options.logger ?? createLogger('google-agent');
    this.runner = new StreamRunner(provider);
  }

  run(input: AgentTurnInput): Observable<AgentEvent> {
    return new Observable<AgentEvent>((subscriber) => {
      const controller = this.linkController(input.sessionId);

      const pump = async (): Promise<void> => {
        try {
          const strategy = await this.resolveStrategy(input, controller.signal);
          if (controller.signal.aborted) {
            subscriber.next({ type: 'done', reason: 'interrupted' });
            subscriber.complete();
            return;
          }

          for await (const event of this.runner.run(input, strategy, controller.signal)) {
            subscriber.next(event);
          }
          subscriber.complete();
        } catch (err) {
          subscriber.error(err instanceof AgentError ? err : AgentError.network('google', err));
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
      this.log.info({ sessionId }, 'interrupting google turn');
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

  private async resolveStrategy(
    input: AgentTurnInput,
    signal: AbortSignal,
  ): Promise<GeminiTurnStrategy> {
    if (this.options.enableNativeRouting === false) {
      return 'custom_tools';
    }
    const lastUserText = extractLastUserText(input);
    if (!lastUserText) return 'custom_tools';

    try {
      return await this.provider.classifyTurn(lastUserText, input.config.modelId, signal);
    } catch (err) {
      this.log.warn({ err }, 'gemini turn classifier failed; falling back to custom_tools');
      return 'custom_tools';
    }
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

function extractLastUserText(input: AgentTurnInput): string {
  const users = input.messages.filter((m) => m.role === 'user');
  const last = users[users.length - 1];
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  return (last.content as ReadonlyArray<{ text?: string }>)
    .map((b) => b.text ?? '')
    .join(' ')
    .trim();
}
