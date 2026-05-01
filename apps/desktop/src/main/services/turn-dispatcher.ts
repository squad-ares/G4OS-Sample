/**
 * TurnDispatcher — orquestra um turno (user msg → agent → runToolLoop →
 * title gen). Reentrância bloqueada por session. ADR-0135.
 */

import { randomUUID } from 'node:crypto';
import type { AgentConfig } from '@g4os/agents/interface';
import type { ToolCatalog, ToolHandler } from '@g4os/agents/tools';
import { composeCatalogs, createToolRegistry } from '@g4os/agents/tools';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import {
  type ContentBlock,
  connectionSlugForProvider,
  type SessionId,
  type ToolDefinition,
} from '@g4os/kernel/types';
import { withSpan } from '@g4os/observability';
import { createTurnTelemetry } from '@g4os/observability/metrics';
import { buildMessageAddedEvent, runToolLoop } from '@g4os/session-runtime';
import { SourceIntentDetector } from '@g4os/sources/lifecycle';
import { err, ok, type Result } from 'neverthrow';
import { applyTurnIntent } from './sessions/apply-intent.ts';
import { buildMountedHandlers } from './sessions/mount-plan.ts';
import { buildSourcePlan, composeSystemPrompt } from './sessions/plan-build.ts';
import { drainActiveTurns } from './sessions/turn-drain.ts';
import { resolveOwnerSession } from './turn-dispatcher-guards.ts';
import type {
  ActiveTurn,
  TurnDispatchDefaults,
  TurnDispatcherDeps,
  TurnDispatchInput,
} from './turn-dispatcher-types.ts';
import {
  DEFAULT_CONNECTION_SLUG,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL_ID,
} from './turn-dispatcher-types.ts';

export type {
  SessionIntentUpdater,
  TitleHook,
  TurnDispatchDefaults,
  TurnDispatcherDeps,
  TurnDispatchInput,
} from './turn-dispatcher-types.ts';

export {
  DEFAULT_CONNECTION_SLUG,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MODEL_ID,
} from './turn-dispatcher-types.ts';

const log = createLogger('turn-dispatcher');

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
    // Teardown sync final (shutdown deve chamar drain antes).
    this._register(toDisposable(() => this.cleanupAll()));
  }

  /** drain aguarda turnos quiescerem; dispose é sync fallback. */
  drain = (deadlineMs?: number): Promise<void> => drainActiveTurns(this.#active, deadlineMs);

  /**
   * Snapshot read-only para o Debug HUD. Não expõe agent /
   * abortController — só o que o card precisa renderizar.
   */
  snapshotActive(): readonly { sessionId: string; turnId: string; startedAt: number }[] {
    const out: { sessionId: string; turnId: string; startedAt: number }[] = [];
    for (const [sessionId, turn] of this.#active) {
      out.push({ sessionId, turnId: turn.turnId, startedAt: turn.startedAt });
    }
    return out;
  }

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

    const ownerSessionResult = await resolveOwnerSession(this.#deps.getSession, input);
    if (ownerSessionResult.isErr()) return err(ownerSessionResult.error);
    const ownerSession = ownerSessionResult.value;

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

    // Reaproveita o `ownerSession` lido no guard de workspace ownership — evita 2 queries
    // pra mesma sessão no caminho hot.
    const session = ownerSession;
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

    // Mount registry I/O pode falhar (filesystem, MCP probe timeout,
    // OAuth refresh). Sem try/catch, reject termina turn sem emitir
    // `turn.error` — renderer fica com spinner permanente. Fallback
    // graceful: continua sem dynamic tools (built-in catalog ainda
    // funciona) + log warn pra observability.
    let mountedHandlers: readonly ToolHandler[] = [];
    try {
      mountedHandlers = await buildMountedHandlers({
        mountRegistry: this.#deps.mountRegistry,
        sourcesStore: this.#deps.sourcesStore,
        credentialVault: this.#deps.credentialVault,
        plan,
        session: refreshedSession,
      });
    } catch (cause) {
      log.warn(
        { err: cause, sessionId },
        'mount handlers build failed; turn proceeds without dynamic tools',
      );
    }
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
    // `completion` deixa `drain()` aguardar quiescência no shutdown.
    let resolveCompletion!: (value: unknown) => void;
    const completion = new Promise<unknown>((r) => (resolveCompletion = r));
    const activeTurn: ActiveTurn = {
      turnId,
      agent,
      abortController,
      subscription: null,
      completion,
      startedAt: Date.now(),
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
    this.#deps.eventBus.emit(sessionId, {
      type: 'turn.done',
      sessionId,
      turnId,
      reason: loopResult.isOk() ? 'stop' : 'error',
    });
    resolveCompletion(loopResult);
    this.cleanup(sessionId, { disposeAgent: true });

    // Dispara geração de título somente após a 3ª mensagem do
    // usuário, para ter contexto suficiente. Turns 1-2 costumam ser
    // saudação / refinamento — título gerado cedo vira "Olá" ou "Como
    // posso ajudar". Após o 3° turn o assunto está estabelecido.
    if (loopResult.isOk() && this.#deps.titleGenerator) {
      void this.#deps.messages.list(sessionId).then((r) => {
        if (!r.isOk()) return;
        const userCount = r.value.filter((m) => m.role === 'user').length;
        if (userCount >= 3) this.#deps.titleGenerator?.scheduleGeneration(sessionId, r.value);
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
