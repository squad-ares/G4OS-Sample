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
      // CR-36 F-CR36-1: NÃO `subscription.unsubscribe()` externo. Fechar o
      // rxjs subscriber antes do `subscriber.complete()` natural do pump
      // torna o callback `complete` em `runAgentIteration`
      // (`turn-runner.ts:219-229`) um no-op silencioso — settle nunca é
      // chamado, Promise pendura, dispatchInternal closure leaks. O
      // `agent.dispose()` abaixo dispara o teardown em `claude-agent.ts:47-54`
      // que aborta os controllers internos do agent; pump completa
      // naturalmente, subscriber.complete() fires com subscriber AINDA
      // subscribed, observer.complete em turn-runner settle resolve antes do
      // process exit.
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
    // CR-30 F-CR30-2: propaga `thinkingLevel` da session metadata para o
    // AgentConfig. Antes o renderer mantinha o valor em useState local sem
    // persistir e o dispatcher nunca injetava — controle do UI era decorativo.
    // Agora UI escreve em `metadata.thinkingLevel` via `sessions.update`, e o
    // dispatcher lê aqui. `level-resolver` decide se mapeia para
    // `reasoning_effort`/`thinkingBudget`/`budgetTokens` ou retorna `none`.
    // Lê do `refreshedSession` (post-applyTurnIntent), não da cópia stale.
    const resolvedThinkingLevel = refreshedSession?.metadata?.thinkingLevel;
    const config: AgentConfig = {
      connectionSlug: resolvedSlug,
      modelId: resolvedModelId,
      maxTokens: this.#defaults.maxTokens,
      ...(toolDefs.length > 0 ? { tools: toolDefs } : {}),
      ...(systemPrompt ? { systemPrompt } : {}),
      ...(resolvedThinkingLevel ? { thinkingLevel: resolvedThinkingLevel } : {}),
    };

    const telemetry = createTurnTelemetry({ provider: config.connectionSlug });
    const agentResult = this.#deps.registry.create(config);
    if (agentResult.isErr()) {
      telemetry.onError(agentResult.error.code);
      log.error({ err: agentResult.error, sessionId }, 'agent factory resolve failed');
      // CR-24 F-CR24-1: persiste como system error ANTES de emitir o evento
      // ephemeral. Sem isso, o renderer só recebe `turn.error` (toast 5s) e
      // perde o erro ao reload — paridade quebrada com V1 que persistia em
      // `event-reducer-error.ts`.
      await this.persistSystemError(sessionId, agentResult.error.code, agentResult.error.message);
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
    // CR-24 F-CR24-1: persiste system error message quando o loop terminou
    // com falha. Cobre os casos em que `turn-runner.ts` já emitiu `turn.error`
    // ephemeral (subscriber.error / agent error event) sem um path de
    // persistência. Não persiste em interrupções deliberadas (`turn aborted`)
    // — usuário sabe que parou, não precisa de card de erro permanente.
    if (loopResult.isErr() && !isAbortedError(loopResult.error)) {
      await this.persistSystemError(sessionId, loopResult.error.code, loopResult.error.message);
    }
    this.#deps.eventBus.emit(sessionId, {
      type: 'turn.done',
      sessionId,
      turnId,
      reason: loopResult.isOk() ? 'stop' : 'error',
    });
    resolveCompletion(loopResult);
    this.cleanup(sessionId, { disposeAgent: true });

    // Paridade V1 (`apps/electron/src/main/sessions/turn-dispatcher.ts`):
    // título tem 2 fases — truncate imediato no 1º turn pra feedback
    // instantâneo na UI; AI refine no 2º turn pra título de qualidade.
    // Antes V2 esperava 3 user msgs pra gerar via IA (CLAUDE.md justificava
    // como "evitar 'Olá' como título"), mas o usuário esperava paridade V1
    // e o gap deixava sub-sidebar com "Nova sessão" por turnos. Truncate
    // imediato cobre o feedback rápido e a IA refina depois — o título
    // genérico só apareceria se o user mandar literalmente só "olá", o que
    // já é raro e o refinement do 2º turn corrige.
    if (loopResult.isOk() && this.#deps.titleGenerator) {
      void this.#deps.messages.list(sessionId).then((r) => {
        if (!r.isOk()) return;
        const userMsgs = r.value.filter((m) => m.role === 'user');
        if (userMsgs.length === 1) {
          this.#deps.titleGenerator?.scheduleImmediateFromFirstMessage(sessionId, text);
        } else if (userMsgs.length >= 2) {
          this.#deps.titleGenerator?.scheduleGeneration(sessionId, r.value);
        }
      });
    }
    return loopResult;
  }

  interrupt(sessionId: SessionId): Result<void, AppError> {
    const active = this.#active.get(sessionId);
    if (!active) {
      // F-CR46-9: retorna err tipado em vez de ok silencioso. Caller IPC
      // pode tratar como benign no-op, mas o tipo expressa a intenção —
      // "stopped successfully" vs "nothing to stop" são estados distintos.
      return err(
        new AppError({
          code: ErrorCode.SESSION_NOT_FOUND,
          message: 'no active turn for session',
          context: { sessionId },
        }),
      );
    }
    try {
      active.abortController.abort();
      // CR-36 F-CR36-1: NÃO `subscription.unsubscribe()` externo. Fechar o
      // rxjs subscriber antes do `subscriber.complete()` natural do pump
      // (chamado pela função em `claude-agent.ts:64-75` quando o for-await
      // termina via abort) torna o callback `complete` em `runAgentIteration`
      // (`turn-runner.ts:219-229`) um no-op silencioso — `settle` nunca é
      // chamado, o Promise interno pendura, e a closure de `dispatchInternal`
      // fica viva indefinidamente segurando referências a messages,
      // telemetry, agent. Memory leak cumulativo por interrupt até process
      // restart. `agent.interrupt(sessionId)` abaixo aborta o controller
      // interno do agent (síncrono via `controller.abort()`); o pump catches
      // abort, runner yields done(reason: 'interrupted'), for-await termina
      // naturalmente, `subscriber.complete()` fires com subscriber AINDA
      // subscribed, observer.complete em turn-runner fires `settle`,
      // runAgentIteration Promise resolve com partial state, runToolLoop
      // retorna ok via finalizeAssistantMessage, dispatchInternal completa,
      // closure GC'd.
      void active.agent.interrupt(sessionId);
      // F-CR46-10: `cancelPendingForSession` em vez de `cancel`. `cancel`
      // esvaziava `#sessionAllow`, perdendo decisões `allow_session` do
      // turn — num retry pós-interrupt o user teria que reaprovar tudo.
      // `cancelPendingForSession` rejeita só as pendências em vôo,
      // preservando o cache de decisões (ADR-0073, ADR-0134, CR-18 F-SR2).
      this.#deps.permissionBroker.cancelPendingForSession(sessionId);
    } finally {
      // CR-23 F-CR23-1: dispose o agent AQUI. Antes era `disposeAgent: false`
      // assumindo que `dispatchInternal` chamaria o cleanup com `true` no
      // fim do loop, mas como interrupt deletava de `#active` primeiro o
      // cleanup do dispatchInternal short-circuitava em `if (!active) return`
      // e `dispose()` nunca rodava — `CodexAgent.dispose` (que kill o
      // subprocess) ficava de fora, deixando 1 subprocess órfão por interrupt.
      this.cleanup(sessionId, { disposeAgent: true });
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

  /**
   * CR-24 F-CR24-1: persiste falha de turn como mensagem `role:'system'` com
   * `metadata.systemKind:'error'` + `errorCode`. Paridade com V1
   * `event-reducer-error.ts` que escrevia `Message{role:'error'}` no
   * histórico. Sem essa persistência, o renderer só recebia `turn.error`
   * ephemeral (toast 5s) e o erro sumia no próximo reload.
   *
   * Best-effort: se o append em si falhar (workspace sem permissão, JSONL
   * write error), apenas logamos warn — o `turn.error` event ainda é
   * emitido pelo caller para que o usuário veja o toast imediato.
   */
  private async persistSystemError(
    sessionId: SessionId,
    code: string,
    message: string,
  ): Promise<void> {
    try {
      const result = await this.#deps.messages.append({
        sessionId,
        role: 'system',
        content: [{ type: 'text', text: message }],
        metadata: { systemKind: 'error', errorCode: code },
      });
      if (result.isErr()) {
        log.warn(
          { err: result.error, sessionId, code },
          'failed to persist system error message; turn.error toast remains',
        );
        return;
      }
      this.#deps.eventBus.emit(sessionId, buildMessageAddedEvent(result.value));
    } catch (cause) {
      log.warn(
        { err: cause, sessionId, code },
        'persistSystemError threw unexpectedly; turn.error toast remains',
      );
    }
  }
}

/**
 * Detecta se o `AppError` representa uma interrupção pelo usuário (Stop).
 * Usado para evitar persistir card de erro permanente quando o turn foi
 * abortado deliberadamente — o usuário sabe que parou, e poluir a transcript
 * com "turn aborted" é ruído UX.
 *
 * CR-25 F-CR25-4: discriminado via `context.aborted: true` (set em
 * `tool-loop.ts:abortError`). String-match em `error.message === 'turn aborted'`
 * era frágil — qualquer refactor futuro mudando a mensagem (i18n, prepend de
 * contexto) silenciosamente quebrava o filtro e cards "turn aborted"
 * apareciam no histórico. Agora o flag estruturado sobrevive a refactor.
 */
function isAbortedError(error: AppError): boolean {
  return error.context['aborted'] === true;
}
