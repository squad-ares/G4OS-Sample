/**
 * TurnDispatcher — orquestra um turno do agente.
 *
 * Fluxo (OUTLIER-09 Fase 1):
 *   1. Persiste user message via MessagesService + emite `message.added`
 *   2. Resolve agent via registry (provider/model derivados da sessão)
 *   3. Emite `turn.started`
 *   4. Delega pro `runToolLoop` (`@g4os/session-runtime`) que:
 *      - Roda iterações do agent (runAgentIteration)
 *      - A cada `done.reason === 'tool_use'`: resolve perms via broker,
 *        executa tools via catalog, persiste assistant(text+tool_use) +
 *        tool(result) e continua
 *      - Ao `stop|max_tokens|error|interrupted`: finaliza e emite
 *        `message.added` do assistant final.
 *
 * Fases prévias:
 *   - OUTLIER-05: MVP Claude direct
 *   - OUTLIER-07: multi-provider
 *   - OUTLIER-08: credenciais via vault
 *
 * Reentrância: se sessão já tiver turno ativo, rejeita com erro.
 */

import { randomUUID } from 'node:crypto';
import type { AgentConfig, AgentRegistry, IAgent } from '@g4os/agents/interface';
import type { ToolCatalog } from '@g4os/agents/tools';
import type { MessagesService } from '@g4os/ipc/server';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import {
  type ContentBlock,
  connectionSlugForProvider,
  type Session,
  type SessionId,
  type ToolDefinition,
} from '@g4os/kernel/types';
import { createTurnTelemetry } from '@g4os/observability/metrics';
import type { PermissionBroker } from '@g4os/permissions';
import { buildMessageAddedEvent, runToolLoop, type SessionEventBus } from '@g4os/session-runtime';
import { formatPlanForPrompt, planTurn, type SourcePlan } from '@g4os/sources/planner';
import type { SourcesStore } from '@g4os/sources/store';
import { err, ok, type Result } from 'neverthrow';

interface UnsubscribableLike {
  unsubscribe(): void;
}

const log = createLogger('turn-dispatcher');

const DEFAULT_MODEL_ID = 'claude-sonnet-4-6';
const DEFAULT_CONNECTION_SLUG = 'anthropic-direct';
const DEFAULT_MAX_TOKENS = 4096;

export interface TurnDispatcherDeps {
  readonly messages: MessagesService;
  readonly registry: AgentRegistry;
  readonly eventBus: SessionEventBus;
  readonly permissionBroker: PermissionBroker;
  readonly toolCatalog: ToolCatalog;
  readonly sourcesStore: SourcesStore;
  readonly getSession: (id: SessionId) => Promise<Session | null>;
  readonly resolveWorkingDirectory: (session: Session | null) => string;
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
}

export class TurnDispatcher extends DisposableBase {
  readonly #deps: TurnDispatcherDeps;
  readonly #defaults: TurnDispatchDefaults;
  readonly #active = new Map<SessionId, ActiveTurn>();

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
    this._register(
      toDisposable(() => {
        for (const [, active] of this.#active) {
          active.abortController.abort();
          active.subscription?.unsubscribe();
          active.agent.dispose();
        }
        this.#active.clear();
      }),
    );
  }

  async dispatch(input: TurnDispatchInput): Promise<Result<void, AppError>> {
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
    this.#deps.eventBus.emit(sessionId, buildMessageAddedEvent(userAppend.value, 0));

    const historyResult = await this.#deps.messages.list(sessionId);
    if (historyResult.isErr()) return err(historyResult.error);
    const messages = historyResult.value;

    const session = await this.#deps.getSession(sessionId);
    const resolvedModelId = session?.modelId ?? this.#defaults.modelId;
    const resolvedSlug = session?.provider
      ? connectionSlugForProvider(session.provider)
      : this.#defaults.connectionSlug;

    const plan = await this.buildSourcePlan(session);
    const systemPrompt = composeSystemPrompt(this.#defaults.systemPrompt, plan);

    const toolDefs: readonly ToolDefinition[] = this.#deps.toolCatalog.list();
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
    const activeTurn: ActiveTurn = { turnId, agent, abortController, subscription: null };
    this.#active.set(sessionId, activeTurn);

    const workingDirectory = this.#deps.resolveWorkingDirectory(session);

    const loopResult = await runToolLoop(
      {
        messages: this.#deps.messages,
        eventBus: this.#deps.eventBus,
        permissionBroker: this.#deps.permissionBroker,
        toolCatalog: this.#deps.toolCatalog,
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

    this.cleanup(sessionId);
    agent.dispose();
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
      this.cleanup(sessionId);
    }
    return ok(undefined);
  }

  hasActiveTurn(sessionId: SessionId): boolean {
    return this.#active.has(sessionId);
  }

  private cleanup(sessionId: SessionId): void {
    this.#active.delete(sessionId);
  }

  private async buildSourcePlan(session: Session | null): Promise<SourcePlan> {
    if (!session) {
      return {
        nativeDeferred: [],
        brokerFallback: [],
        filesystemDirect: [],
        rejected: [],
        sticky: [],
      };
    }
    try {
      const all = await this.#deps.sourcesStore.list(session.workspaceId);
      return planTurn({
        enabledSources: all.filter((s) => s.enabled),
        stickySlugs: session.stickyMountedSourceSlugs,
        rejectedSlugs: session.rejectedSourceSlugs,
      });
    } catch (error) {
      log.warn(
        { err: String(error), sessionId: session.id },
        'failed to build source plan; proceeding without sources',
      );
      return {
        nativeDeferred: [],
        brokerFallback: [],
        filesystemDirect: [],
        rejected: [],
        sticky: [],
      };
    }
  }
}

function composeSystemPrompt(base: string | undefined, plan: SourcePlan): string | undefined {
  const planSummary = formatPlanForPrompt(plan);
  const hasSources =
    plan.nativeDeferred.length + plan.brokerFallback.length + plan.filesystemDirect.length > 0;
  if (!base && !hasSources) return undefined;
  const parts: string[] = [];
  if (base) parts.push(base);
  if (hasSources) parts.push(planSummary);
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}
