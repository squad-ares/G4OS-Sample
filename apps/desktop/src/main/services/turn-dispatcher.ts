/**
 * TurnDispatcher — orquestra um turno (user msg → agent → runToolLoop →
 * title gen). Reentrância bloqueada por session. ADR-0135 + OUTLIER-09.
 */

import { randomUUID } from 'node:crypto';
import type { AgentConfig, AgentRegistry, IAgent } from '@g4os/agents/interface';
import {
  composeCatalogs,
  createToolRegistry,
  type ToolCatalog,
  type ToolHandler,
} from '@g4os/agents/tools';
import type { CredentialVault } from '@g4os/credentials';
import type { MessagesService } from '@g4os/ipc/server';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import {
  type ContentBlock,
  connectionSlugForProvider,
  type Message,
  type Session,
  type SessionId,
  type ToolDefinition,
} from '@g4os/kernel/types';
import { withSpan } from '@g4os/observability';
import { createTurnTelemetry } from '@g4os/observability/metrics';
import type { PermissionBroker } from '@g4os/permissions';
import { buildMessageAddedEvent, runToolLoop, type SessionEventBus } from '@g4os/session-runtime';
import type { McpMountRegistry } from '@g4os/sources/broker';
import { SourceIntentDetector } from '@g4os/sources/lifecycle';
import type { SourcesStore } from '@g4os/sources/store';
import { err, ok, type Result } from 'neverthrow';
import { applyTurnIntent, type SessionIntentUpdater } from './sessions/apply-intent.ts';
import { buildMountedHandlers } from './sessions/mount-plan.ts';
import { buildSourcePlan, composeSystemPrompt } from './sessions/plan-build.ts';
import { drainActiveTurns } from './sessions/turn-drain.ts';

export type { SessionIntentUpdater };

interface UnsubscribableLike {
  unsubscribe(): void;
}

const log = createLogger('turn-dispatcher');

const DEFAULT_MODEL_ID = 'claude-sonnet-4-6';
const DEFAULT_CONNECTION_SLUG = 'anthropic-direct';
const DEFAULT_MAX_TOKENS = 4096;

export interface TitleHook {
  scheduleGeneration(sessionId: SessionId, messages: readonly Message[]): void;
}

export interface TurnDispatcherDeps {
  readonly messages: MessagesService;
  readonly registry: AgentRegistry;
  readonly eventBus: SessionEventBus;
  readonly permissionBroker: PermissionBroker;
  readonly toolCatalog: ToolCatalog;
  readonly sourcesStore: SourcesStore;
  readonly credentialVault?: CredentialVault | undefined;
  readonly mountRegistry?: McpMountRegistry;
  readonly titleGenerator?: TitleHook;
  readonly getSession: (id: SessionId) => Promise<Session | null>;
  readonly resolveWorkingDirectory: (session: Session | null) => string;
  readonly sessionIntentUpdater?: SessionIntentUpdater;
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

interface ActiveTurn {
  readonly turnId: string;
  readonly agent: IAgent;
  readonly abortController: AbortController;
  subscription: UnsubscribableLike | null;
  readonly completion: Promise<unknown>;
}

export class TurnDispatcher extends DisposableBase {
  readonly #deps: TurnDispatcherDeps;
  readonly #defaults: TurnDispatchDefaults;
  readonly #active = new Map<SessionId, ActiveTurn>();
  readonly #intent = new SourceIntentDetector();

  constructor(deps: TurnDispatcherDeps) {
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
    // CR6-08: teardown sync final (shutdown deve chamar drain antes).
    this._register(toDisposable(() => this.cleanupAll()));
  }

  /** CR6-08: drain aguarda turnos quiescerem; dispose é sync fallback. */
  drain = (deadlineMs?: number): Promise<void> => drainActiveTurns(this.#active, deadlineMs);

  private cleanupAll(): void {
    for (const [, active] of this.#active) {
      active.abortController.abort();
      active.subscription?.unsubscribe();
      active.agent.dispose();
    }
    this.#active.clear();
  }

  dispatch(input: TurnDispatchInput): Promise<Result<void, AppError>> {
    return withSpan('turn.dispatch', { attributes: { 'session.id': input.sessionId } }, () =>
      this.dispatchInternal(input),
    );
  }

  private async dispatchInternal(input: TurnDispatchInput): Promise<Result<void, AppError>> {
    const { sessionId, text } = input;

    if (this.#active.has(sessionId)) {
      return err(
        new AppError({
          code: ErrorCode.SESSION_LOCKED,
          message: 'Another turn is already running for this session',
          context: { sessionId },
        }),
      );
    }

    const userContent: ContentBlock[] = [{ type: 'text', text }];
    const userAppend = await this.#deps.messages.append({
      sessionId,
      role: 'user',
      content: userContent,
    });
    if (userAppend.isErr()) {
      log.error({ err: userAppend.error, sessionId }, 'failed to persist user message');
      return err(userAppend.error);
    }
    this.#deps.eventBus.emit(sessionId, buildMessageAddedEvent(userAppend.value));

    const historyResult = await this.#deps.messages.list(sessionId);
    if (historyResult.isErr()) return err(historyResult.error);
    const messages = historyResult.value;

    const session = await this.#deps.getSession(sessionId);
    await applyTurnIntent(
      {
        detector: this.#intent,
        sourcesStore: this.#deps.sourcesStore,
        updater: this.#deps.sessionIntentUpdater,
      },
      sessionId,
      text,
      session,
    );
    const resolvedModelId = session?.modelId ?? this.#defaults.modelId;
    const resolvedSlug = session?.provider
      ? connectionSlugForProvider(session.provider)
      : this.#defaults.connectionSlug;

    // Re-fetch session para incluir rejections/stickys recém-aplicados.
    const refreshedSession = await this.#deps.getSession(sessionId);
    const plan = await buildSourcePlan(this.#deps.sourcesStore, refreshedSession);
    const systemPrompt = composeSystemPrompt(this.#defaults.systemPrompt, plan);

    const mountedHandlers: readonly ToolHandler[] = await buildMountedHandlers({
      mountRegistry: this.#deps.mountRegistry,
      sourcesStore: this.#deps.sourcesStore,
      credentialVault: this.#deps.credentialVault,
      plan,
      session: refreshedSession,
    });
    const effectiveCatalog: ToolCatalog =
      mountedHandlers.length === 0
        ? this.#deps.toolCatalog
        : composeCatalogs(this.#deps.toolCatalog, createToolRegistry([...mountedHandlers]));
    const toolDefs: readonly ToolDefinition[] = effectiveCatalog.list();
    const config: AgentConfig = {
      connectionSlug: resolvedSlug,
      modelId: resolvedModelId,
      maxTokens: this.#defaults.maxTokens,
      ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
      ...(systemPrompt ? { systemPrompt } : {}),
    };

    const telemetry = createTurnTelemetry({ provider: config.connectionSlug });
    const agentResult = this.#deps.registry.create(config);
    if (agentResult.isErr()) {
      telemetry.onError(agentResult.error.code);
      log.error({ err: agentResult.error, sessionId }, 'agent factory resolve failed');
      this.#deps.eventBus.emit(sessionId, {
        type: 'turn.error',
        sessionId,
        turnId: 'pre-start',
        code: agentResult.error.code,
        message: agentResult.error.message,
      });
      return err(
        new AppError({
          code: ErrorCode.AGENT_UNAVAILABLE,
          message: agentResult.error.message,
          context: { sessionId, modelId: config.modelId },
        }),
      );
    }

    const agent = agentResult.value;
    const turnId = randomUUID();
    telemetry.onStart();
    this.#deps.eventBus.emit(sessionId, { type: 'turn.started', sessionId, turnId });

    const abortController = new AbortController();
    const workingDirectory = this.#deps.resolveWorkingDirectory(session);
    // CR6-08: `completion` deixa `drain()` aguardar quiescência no shutdown.
    let resolveCompletion!: (value: unknown) => void;
    const completion = new Promise<unknown>((r) => (resolveCompletion = r));
    const activeTurn: ActiveTurn = {
      turnId,
      agent,
      abortController,
      subscription: null,
      completion,
    };
    this.#active.set(sessionId, activeTurn);

    const loopResult = await runToolLoop(
      {
        messages: this.#deps.messages,
        eventBus: this.#deps.eventBus,
        permissionBroker: this.#deps.permissionBroker,
        toolCatalog: effectiveCatalog,
      },
      {
        sessionId,
        turnId,
        agent,
        initialMessages: messages,
        config,
        workingDirectory,
        telemetry,
        signal: abortController.signal,
        ...(session?.workspaceId ? { workspaceId: session.workspaceId } : {}),
        onSubscription: (sub) => {
          activeTurn.subscription = sub;
        },
      },
    );
    resolveCompletion(loopResult);
    this.cleanup(sessionId, { disposeAgent: true });

    if (loopResult.isOk() && this.#deps.titleGenerator) {
      void this.#deps.messages.list(sessionId).then((r) => {
        if (r.isOk()) this.#deps.titleGenerator?.scheduleGeneration(sessionId, r.value);
      });
    }
    return loopResult;
  }

  interrupt(sessionId: SessionId): Result<void, AppError> {
    const active = this.#active.get(sessionId);
    if (!active) return ok(undefined);
    try {
      active.abortController.abort();
      active.subscription?.unsubscribe();
      void active.agent.interrupt(sessionId);
      this.#deps.permissionBroker.cancel(sessionId);
    } finally {
      this.cleanup(sessionId, { disposeAgent: false });
    }
    return ok(undefined);
  }

  hasActiveTurn(sessionId: SessionId): boolean {
    return this.#active.has(sessionId);
  }

  private cleanup(sessionId: SessionId, opts: { disposeAgent: boolean }): void {
    const active = this.#active.get(sessionId);
    if (!active) return;
    if (opts.disposeAgent) active.agent.dispose();
    this.#active.delete(sessionId);
  }
}
