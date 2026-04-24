/**
 * WorkerTurnDispatcher — orquestrador main-side quando o turn executa em
 * session worker (OUTLIER-11 Phase 3). Mesma interface pública de
 * `TurnDispatcher` (`dispatch` / `interrupt` / `hasActiveTurn` / `dispose`)
 * para poder substituí-lo atrás de um flag em `SessionsService`.
 *
 * Responsabilidades main:
 *  - Persistir user message antes de despachar.
 *  - Carregar history + resolver config (provider/model).
 *  - Gather credentials do `CredentialVault` para o bundle por turno.
 *  - Chamar `SessionManager.dispatchTurn(...)`.
 *  - Assinar `turn.complete` do bus para persistir assistant message.
 *
 * Worker roda agent + emite streaming; não toca SQLite/safeStorage.
 */
import type { CredentialVault } from '@g4os/credentials';
import type { MessagesService } from '@g4os/ipc/server';
import { DisposableBase, type IDisposable, toDisposable } from '@g4os/kernel/disposable';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { connectionSlugForProvider, type Session, type SessionId } from '@g4os/kernel/types';
import { createTurnTelemetry, type TurnTelemetry } from '@g4os/observability/metrics';
import {
  buildMessageAddedEvent,
  finalizeAssistantMessage,
  type SessionEventBus,
  type TurnCompleteEvent,
} from '@g4os/session-runtime';
import { err, ok, type Result } from 'neverthrow';
import type { CredentialBundle } from '../workers/protocol.ts';
import type { SessionManager } from './session-manager.ts';

const log = createLogger('worker-turn-dispatcher');

const DEFAULT_MODEL_ID = 'claude-sonnet-4-6';
const DEFAULT_CONNECTION_SLUG = 'anthropic-direct';
const DEFAULT_MAX_TOKENS = 4096;

export interface WorkerTurnDispatcherDeps {
  readonly messages: MessagesService;
  readonly sessionManager: SessionManager;
  readonly eventBus: SessionEventBus;
  readonly vault: CredentialVault;
  readonly getSession: (id: SessionId) => Promise<Session | null>;
  readonly defaults?: Partial<TurnDispatchDefaults>;
}

export interface TurnDispatchDefaults {
  readonly modelId: string;
  readonly connectionSlug: string;
  readonly maxTokens: number;
  readonly systemPrompt?: string;
}

export interface TurnDispatchInput {
  readonly sessionId: SessionId;
  readonly text: string;
}

export class WorkerTurnDispatcher extends DisposableBase {
  readonly #deps: WorkerTurnDispatcherDeps;
  readonly #defaults: TurnDispatchDefaults;
  readonly #completeSubs = new Map<SessionId, IDisposable>();
  readonly #activeTurns = new Map<SessionId, string>();
  readonly #telemetries = new Map<SessionId, TurnTelemetry>();

  constructor(deps: WorkerTurnDispatcherDeps) {
    super();
    this.#deps = deps;
    this.#defaults = {
      modelId: deps.defaults?.modelId ?? DEFAULT_MODEL_ID,
      connectionSlug: deps.defaults?.connectionSlug ?? DEFAULT_CONNECTION_SLUG,
      maxTokens: deps.defaults?.maxTokens ?? DEFAULT_MAX_TOKENS,
      ...(deps.defaults?.systemPrompt === undefined
        ? {}
        : { systemPrompt: deps.defaults.systemPrompt }),
    };
    this._register(
      toDisposable(() => {
        for (const [sessionId] of this.#activeTurns) this.cleanup(sessionId);
        this.#activeTurns.clear();
      }),
    );
  }

  async dispatch(input: TurnDispatchInput): Promise<Result<void, AppError>> {
    const { sessionId, text } = input;

    if (this.#activeTurns.has(sessionId)) {
      return err(
        new AppError({
          code: ErrorCode.SESSION_LOCKED,
          message: 'Another turn is already running for this session',
          context: { sessionId },
        }),
      );
    }

    const userAppend = await this.#deps.messages.append({
      sessionId,
      role: 'user',
      content: [{ type: 'text', text }],
    });
    if (userAppend.isErr()) return err(userAppend.error);
    this.#deps.eventBus.emit(sessionId, buildMessageAddedEvent(userAppend.value, 0));

    const historyResult = await this.#deps.messages.list(sessionId);
    if (historyResult.isErr()) return err(historyResult.error);
    const messages = historyResult.value;

    const session = await this.#deps.getSession(sessionId);
    const modelId = session?.modelId ?? this.#defaults.modelId;
    const connectionSlug = session?.provider
      ? connectionSlugForProvider(session.provider)
      : this.#defaults.connectionSlug;

    const turnId = crypto.randomUUID();
    this.#activeTurns.set(sessionId, turnId);
    const telemetry = createTurnTelemetry({ provider: connectionSlug });
    telemetry.onStart();
    this.#telemetries.set(sessionId, telemetry);
    this.#deps.eventBus.emit(sessionId, { type: 'turn.started', sessionId, turnId });

    this.subscribeTurnComplete(sessionId);

    const credentials = await this.gatherCredentials();

    try {
      await this.#deps.sessionManager.dispatchTurn({
        sessionId,
        turnId,
        messages: [...messages],
        config: {
          connectionSlug,
          modelId,
          maxTokens: this.#defaults.maxTokens,
          ...(this.#defaults.systemPrompt === undefined
            ? {}
            : { systemPrompt: this.#defaults.systemPrompt }),
        },
        credentials,
      });
    } catch (dispatchErr) {
      telemetry.onError('worker.dispatch_failed');
      this.cleanup(sessionId);
      const message = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
      this.#deps.eventBus.emit(sessionId, {
        type: 'turn.error',
        sessionId,
        turnId,
        code: 'worker.dispatch_failed',
        message,
      });
      return err(
        new AppError({
          code: ErrorCode.AGENT_UNAVAILABLE,
          message,
          context: { sessionId, turnId },
        }),
      );
    }

    return ok(undefined);
  }

  interrupt(sessionId: SessionId): Result<void, AppError> {
    const turnId = this.#activeTurns.get(sessionId);
    if (!turnId) return ok(undefined);
    this.#deps.sessionManager.interrupt(sessionId, turnId);
    this.cleanup(sessionId);
    return ok(undefined);
  }

  hasActiveTurn(sessionId: SessionId): boolean {
    return this.#activeTurns.has(sessionId);
  }

  private subscribeTurnComplete(sessionId: SessionId): void {
    const sub = this.#deps.eventBus.subscribe(sessionId, (event) => {
      if (event.type !== 'turn.complete') return;
      void this.handleTurnComplete(sessionId, event);
    });
    const prior = this.#completeSubs.get(sessionId);
    if (prior) prior.dispose();
    this.#completeSubs.set(sessionId, sub);
  }

  private async handleTurnComplete(sessionId: SessionId, event: TurnCompleteEvent): Promise<void> {
    const activeTurn = this.#activeTurns.get(sessionId);
    if (activeTurn !== event.turnId) return;

    const telemetry = this.#telemetries.get(sessionId);
    if (telemetry) {
      telemetry.onUsage(event.usage);
      if (event.reason === 'error') telemetry.onError('worker.turn_error');
      else telemetry.onDone(event.reason);
    }

    const textChunks = event.text.length > 0 ? [event.text] : [];
    const thinkingChunks = event.thinking.length > 0 ? [event.thinking] : [];
    const result = await finalizeAssistantMessage(
      { messages: this.#deps.messages, eventBus: this.#deps.eventBus },
      {
        sessionId,
        turnId: event.turnId,
        textChunks,
        thinkingChunks,
        usageInput: event.usage.input,
        usageOutput: event.usage.output,
        modelId: event.modelId,
      },
    );
    if (result.isErr()) {
      log.error(
        { err: result.error, sessionId, turnId: event.turnId },
        'failed to persist assistant message',
      );
    }
    this.cleanup(sessionId);
  }

  private cleanup(sessionId: SessionId): void {
    this.#activeTurns.delete(sessionId);
    this.#telemetries.delete(sessionId);
    const sub = this.#completeSubs.get(sessionId);
    if (sub) {
      sub.dispose();
      this.#completeSubs.delete(sessionId);
    }
  }

  private async gatherCredentials(): Promise<CredentialBundle> {
    const [anthropic, openai, google] = await Promise.all([
      this.#deps.vault.get('anthropic_api_key'),
      this.#deps.vault.get('openai_api_key'),
      this.#deps.vault.get('google_api_key'),
    ]);
    return {
      ...(anthropic.isOk() && anthropic.value ? { anthropicApiKey: anthropic.value } : {}),
      ...(openai.isOk() && openai.value ? { openaiApiKey: openai.value } : {}),
      ...(google.isOk() && google.value ? { googleApiKey: google.value } : {}),
    };
  }
}
