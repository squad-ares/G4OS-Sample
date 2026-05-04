/**
 * PermissionBroker — mediador entre tool calls do agent e decisão do usuário.
 *
 * Fluxo com persistência:
 *   1. Tool loop chama `request({sessionId, turnId, toolName, input, workspaceId?})`
 *      ao receber `tool_use_complete` do agent.
 *   2. Broker consulta `PermissionStore.find(workspaceId, toolName, input)`:
 *      - Match → auto-resolve com `allow_once` (decisão já aprovada antes).
 *   3. Broker consulta cache in-memory de `allow_session` por `(sessionId,
 *      toolName, argsHash)`:
 *      - Match → auto-resolve com `allow_once`.
 *   4. Miss em ambos → cria Deferred, emite `turn.permission_required` via
 *      callback `onRequest`, aguarda `respond(requestId, decision)`.
 *   5. Após usuário responder:
 *      - `allow_always` → persiste no store (próxima vez auto-resolve).
 *      - `allow_session` → adiciona ao cache in-memory da sessão.
 *      - `allow_once` / `deny` → nada a persistir.
 *
 * `cancel(sessionId)` rejeita pendências + limpa cache `allow_session`.
 * `dispose()` rejeita todas as pendências (shutdown).
 */

import { randomUUID } from 'node:crypto';
import { DisposableBase } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import { hashArgs, type PermissionStore } from './permission-store.ts';

const log = createLogger('permission-broker');

export type PermissionDecision = 'allow_once' | 'allow_session' | 'allow_always' | 'deny';

export interface PermissionRequestInput {
  readonly sessionId: string;
  readonly turnId: string;
  readonly toolUseId: string;
  readonly toolName: string;
  /** Input parsed do tool call. Broker computa hash internamente. */
  readonly input: Readonly<Record<string, unknown>>;
  /** Necessário para lookup/persistência no PermissionStore. Sem ele, o
   *  broker ainda funciona mas não persiste decisions. */
  readonly workspaceId?: string;
}

export interface PermissionRequest {
  readonly requestId: string;
  readonly sessionId: string;
  readonly turnId: string;
  readonly toolUseId: string;
  readonly toolName: string;
  readonly inputJson: string;
}

interface Pending {
  readonly resolve: (decision: PermissionDecision) => void;
  readonly reject: (err: Error) => void;
  readonly request: PermissionRequest;
  readonly argsHash: string;
  readonly coalesceKey: string;
  /** Handle do timeout para cancelar quando responde/cancela. */
  readonly timeoutHandle: ReturnType<typeof setTimeout>;
  readonly workspaceId?: string;
  readonly input: Readonly<Record<string, unknown>>;
}

// Timeout default de 5min em request pendente. Usuário precisa de
// tempo razoável para ler permission modal, mas não infinito — sem isso o
// broker acumulava promises em `#pending` por turnos abandonados, vazando
// memória até dispose. Auto-deny em timeout.
const DEFAULT_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

export class PermissionBroker extends DisposableBase {
  readonly #pending = new Map<string, Pending>();
  /** Cache `allow_session` por sessão: set de `${toolName}:${argsHash}`. */
  readonly #sessionAllow = new Map<string, Set<string>>();
  /**
   * Coalescing de requests in-flight: duas chamadas concorrentes para o
   * mesmo `(sessionId, toolName, argsHash)` recebem o mesmo Deferred em
   * vez de gerar dois prompts modais idênticos. Removido quando a
   * pendência resolve/rejeita.
   */
  readonly #coalesce = new Map<string, Promise<PermissionDecision>>();
  readonly #onRequest: (req: PermissionRequest) => void;
  readonly #store: PermissionStore | undefined;
  readonly #requestTimeoutMs: number;
  /**
   * CR-18 F-DT-L: tools cuja decisão `allow_always` NÃO deve ser persistida.
   * `run_bash` é o caso canônico — segundos cmd shell idêntico passa direto
   * (e.g., attacker que conseguiu uma vez `rm -rf $HOME`). Decisão é
   * downgraded para `allow_session` (vale só pro turno atual).
   */
  readonly #nonPersistableTools: ReadonlySet<string>;

  constructor(
    onRequest: (req: PermissionRequest) => void,
    options: {
      readonly store?: PermissionStore;
      /** Override timeout em testes. Default 5min. */
      readonly requestTimeoutMs?: number;
      /**
       * Tools que nunca persistem `allow_always`. Decisões viram
       * `allow_session` automaticamente — usuário precisa reaprovar a cada
       * sessão. Default: `['run_bash']` (CR-18 F-DT-L).
       */
      readonly nonPersistableTools?: readonly string[];
    } = {},
  ) {
    super();
    this.#onRequest = onRequest;
    if (options.store) this.#store = options.store;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#nonPersistableTools = new Set(options.nonPersistableTools ?? ['run_bash']);
  }

  async request(input: PermissionRequestInput): Promise<PermissionDecision> {
    const argsHash = hashArgs(input.input);

    // Cache check: allow_session in-memory.
    if (sessionAllowHas(this.#sessionAllow, input.sessionId, input.toolName, argsHash)) {
      log.debug(
        { sessionId: input.sessionId, toolName: input.toolName },
        'permission auto-resolved via allow_session cache',
      );
      return 'allow_once';
    }

    // Store check: allow_always persistido.
    if (this.#store && input.workspaceId) {
      const found = await this.#store.find(input.workspaceId, input.toolName, input.input);
      if (found) {
        log.info(
          { workspaceId: input.workspaceId, toolName: input.toolName, argsHash: found.argsHash },
          'permission auto-resolved via allow_always store',
        );
        return 'allow_once';
      }
    }

    // Coalesce: se já existe pendência idêntica nessa sessão+workspace, reaproveita.
    // WorkspaceId entra na chave para garantir isolamento entre tenants.
    // Prefixos `ws:` / `no-ws:` evitam colisão teórica com workspaceId
    // que valha a string sentinel (improvável com nanoids mas anti-pattern).
    const wsKey = input.workspaceId ? `ws:${input.workspaceId}` : 'no-ws';
    const coalesceKey = `${wsKey}:${input.sessionId}:${input.toolName}:${argsHash}`;
    const inflight = this.#coalesce.get(coalesceKey);
    if (inflight) {
      log.debug({ coalesceKey }, 'permission request coalesced into existing in-flight request');
      return inflight;
    }

    // Miss → pergunta ao usuário.
    const requestId = randomUUID();
    const request: PermissionRequest = {
      requestId,
      sessionId: input.sessionId,
      turnId: input.turnId,
      toolUseId: input.toolUseId,
      toolName: input.toolName,
      inputJson: safeJson(input.input),
    };

    // CR-18 F-PE1: usamos um Deferred construído FORA do Promise constructor.
    // Antes, o `#pending.set(...)` ficava dentro do `new Promise(...)`, e
    // `this.#onRequest(request)` rodava ANTES — se o callback chamasse
    // `respond(requestId, ...)` síncrono (test stub, in-process adapter),
    // `respond` consultava `#pending.get(requestId)` antes da pendência
    // existir e retornava `false`. O Promise nunca resolvia → caller hang
    // até o timeout interno de 5 minutos. Agora `#pending`/`#coalesce` ficam
    // populados antes de qualquer chamada externa que possa responder de volta.
    let resolveDeferred!: (decision: PermissionDecision) => void;
    let rejectDeferred!: (cause: unknown) => void;
    const promise = new Promise<PermissionDecision>((resolve, reject) => {
      resolveDeferred = resolve;
      rejectDeferred = reject;
    });

    const timeoutHandle = setTimeout(() => {
      if (this.#pending.has(requestId)) {
        log.warn(
          { requestId, toolName: input.toolName, timeoutMs: this.#requestTimeoutMs },
          'permission request timed out; auto-denying',
        );
        this.#pending.delete(requestId);
        this.#coalesce.delete(coalesceKey);
        resolveDeferred('deny');
      }
    }, this.#requestTimeoutMs);
    try {
      timeoutHandle.unref?.();
    } catch (err) {
      log.warn(
        { err: String(err) },
        'permission timeout handle.unref failed; rely on dispose() for cleanup',
      );
    }

    this.#pending.set(requestId, {
      resolve: resolveDeferred,
      reject: rejectDeferred,
      request,
      argsHash,
      coalesceKey,
      timeoutHandle,
      ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
      input: input.input,
    });
    this.#coalesce.set(coalesceKey, promise);
    log.info(
      { requestId, sessionId: input.sessionId, toolName: input.toolName },
      'permission requested',
    );

    // Agora seguro chamar onRequest — se o callback for síncrono e responder
    // imediato, `respond()` encontra a pendência. Se throw, removemos a
    // pendência criada acima e retornamos 'deny' fail-safe.
    try {
      this.#onRequest(request);
    } catch (err) {
      log.error(
        {
          err: err instanceof Error ? err.message : String(err),
          requestId,
          toolName: input.toolName,
        },
        'permission onRequest callback threw; failing safe with deny',
      );
      this.#pending.delete(requestId);
      this.#coalesce.delete(coalesceKey);
      clearTimeout(timeoutHandle);
      return 'deny';
    }

    return promise;
  }

  async respond(requestId: string, decision: PermissionDecision): Promise<boolean> {
    const pending = this.#pending.get(requestId);
    if (!pending) {
      log.warn({ requestId }, 'respond called for unknown permission request');
      return false;
    }
    clearTimeout(pending.timeoutHandle);
    this.#pending.delete(requestId);
    this.#coalesce.delete(pending.coalesceKey);
    log.info({ requestId, sessionId: pending.request.sessionId, decision }, 'permission resolved');

    // CR-18 F-DT-L: downgrade `allow_always` para `allow_session` em tools
    // não-persistíveis. `run_bash` é o caso canônico — `rm -rf $HOME`
    // aprovado uma vez não pode rodar silenciosamente em sessões futuras.
    let effectiveDecision = decision;
    if (decision === 'allow_always' && this.#nonPersistableTools.has(pending.request.toolName)) {
      log.warn(
        {
          requestId,
          toolName: pending.request.toolName,
          sessionId: pending.request.sessionId,
        },
        'allow_always downgraded to allow_session: tool is non-persistable',
      );
      effectiveDecision = 'allow_session';
    }

    // Side-effects antes de resolver a promise.
    if (effectiveDecision === 'allow_session') {
      sessionAllowAdd(
        this.#sessionAllow,
        pending.request.sessionId,
        pending.request.toolName,
        pending.argsHash,
      );
    } else if (effectiveDecision === 'allow_always' && this.#store && pending.workspaceId) {
      // Await persist + fsync ANTES de resolver. Antes era
      // fire-and-forget — se app crashasse entre `persist()` retornar e
      // `writeAtomic` flushar, decisão `allow_always` se perdia. Latência
      // adicional é aceita: usuário acabou de clicar "Always", está
      // esperando o tool rodar; janela de poucos ms para fsync é
      // imperceptível e garante que próximo turn não pergunta de novo.
      //
      // CR-43 F-CR42-2: se persist falha, fazer downgrade para `allow_once`
      // em vez de resolver com `allow_always`. Antes o catch apenas logava mas
      // a linha seguinte resolvia com `effectiveDecision` (= `allow_always`),
      // criando discrepância: caller recebia `allow_always` mas no próximo turn
      // o broker perguntava de novo (store vazio). Agora o behavior e o log
      // estão alinhados: falha de persistência → `allow_once` explícito.
      try {
        await this.#store.persist(pending.workspaceId, {
          toolName: pending.request.toolName,
          args: pending.input,
        });
      } catch (err) {
        log.warn(
          {
            err: err instanceof Error ? err.message : String(err),
            toolName: pending.request.toolName,
            requestId,
            workspaceId: pending.workspaceId,
          },
          'failed to persist allow_always — downgrading to allow_once for this turn',
        );
        effectiveDecision = 'allow_once';
      }
    } else if (effectiveDecision === 'allow_always' && (!this.#store || !pending.workspaceId)) {
      // Sem store ou workspaceId, persistência é no-op. Downgrade explícito
      // para allow_session para evitar resolver com allow_always sem garantia
      // de que a decisão será honrada no próximo turn.
      log.warn(
        { requestId, toolName: pending.request.toolName, hasStore: !!this.#store },
        'allow_always sem store/workspaceId — downgrading to allow_session',
      );
      effectiveDecision = 'allow_session';
      sessionAllowAdd(
        this.#sessionAllow,
        pending.request.sessionId,
        pending.request.toolName,
        pending.argsHash,
      );
    }

    pending.resolve(effectiveDecision);
    return true;
  }

  /**
   * Rejeita todas as pendências da sessão E limpa o cache `allow_session`.
   *
   * @deprecated CR-42 F-CR42-6 — API faz duas coisas com nome ambíguo.
   *   - Para abortar tool mid-turn: prefira `cancelPendingForSession(sessionId)`
   *     (preserva cache `allow_session` do turno atual).
   *   - Para limpar cache ao encerrar sessão: prefira `clearSessionAllow(sessionId)`.
   *   Manter por compatibilidade com callers legados até migração completa.
   *   Auditar `apps/desktop/src/main/services/turn-dispatcher.ts` — `interrupt()`
   *   chama este método mas deveria chamar só `cancelPendingForSession` (abort
   *   mid-turn preserva decisões `allow_session` do turn).
   */
  cancel(sessionId: string): void {
    for (const [id, pending] of this.#pending) {
      if (pending.request.sessionId !== sessionId) continue;
      clearTimeout(pending.timeoutHandle);
      this.#pending.delete(id);
      this.#coalesce.delete(pending.coalesceKey);
      pending.reject(new Error('permission request cancelled'));
    }
    this.#sessionAllow.delete(sessionId);
  }

  /**
   * CR-18 F-SR2: cancela UMA pendência por `requestId` sem tocar no
   * `#sessionAllow` cache. `cancel(sessionId)` é granular demais quando
   * apenas um tool_use foi abortado mid-turn — limpar `allow_session`
   * decisões anteriores do mesmo turno faria o usuário aprovar tudo de
   * novo se houver nova permission request depois.
   *
   * Retorna `true` se a pendência existia e foi rejeitada; `false` se já
   * havia sido respondida/cancelada.
   */
  cancelRequest(requestId: string): boolean {
    const pending = this.#pending.get(requestId);
    if (!pending) return false;
    clearTimeout(pending.timeoutHandle);
    this.#pending.delete(requestId);
    this.#coalesce.delete(pending.coalesceKey);
    pending.reject(new Error('permission request cancelled'));
    return true;
  }

  /**
   * CR-18 F-PE3: limpa apenas o cache `allow_session` de uma sessão sem
   * tocar nas pendências em vôo. Usado pelo session lifecycle quando
   * sessão fecha normalmente (archive, transição de estado) — sem essa
   * API, o Set crescia indefinidamente até o próximo `cancel(sessionId)`
   * ou `dispose()` (que pode levar dias em uso longo).
   */
  clearSessionAllow(sessionId: string): void {
    this.#sessionAllow.delete(sessionId);
  }

  /**
   * CR-18 F-SR2: cancela todas as pendências de uma sessão SEM limpar o
   * cache `allow_session`. Usado pelo tool-execution quando uma tool
   * é abortada mid-turn — preserva decisões `allow_session` anteriores
   * do mesmo turno. Para limpeza completa (fim de sessão, dispose),
   * usar `cancel(sessionId)`.
   */
  cancelPendingForSession(sessionId: string): number {
    let cancelled = 0;
    for (const [id, pending] of this.#pending) {
      if (pending.request.sessionId !== sessionId) continue;
      clearTimeout(pending.timeoutHandle);
      this.#pending.delete(id);
      this.#coalesce.delete(pending.coalesceKey);
      pending.reject(new Error('permission request cancelled'));
      cancelled += 1;
    }
    return cancelled;
  }

  override dispose(): void {
    if (this._disposed) return;
    for (const [, pending] of this.#pending) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(new Error('permission broker disposed'));
    }
    this.#pending.clear();
    this.#sessionAllow.clear();
    this.#coalesce.clear();
    super.dispose();
  }

  get pendingCount(): number {
    return this.#pending.size;
  }
}

function sessionAllowKey(toolName: string, argsHash: string): string {
  return `${toolName}:${argsHash}`;
}

function sessionAllowHas(
  map: Map<string, Set<string>>,
  sessionId: string,
  toolName: string,
  argsHash: string,
): boolean {
  return map.get(sessionId)?.has(sessionAllowKey(toolName, argsHash)) ?? false;
}

function sessionAllowAdd(
  map: Map<string, Set<string>>,
  sessionId: string,
  toolName: string,
  argsHash: string,
): void {
  let set = map.get(sessionId);
  if (!set) {
    set = new Set();
    map.set(sessionId, set);
  }
  set.add(sessionAllowKey(toolName, argsHash));
}

function safeJson(input: Readonly<Record<string, unknown>>): string {
  // CR-42 F-CR42-12: usar JSON.stringify mas logar shapes não-serializáveis
  // (DataView, Map, Set) que retornam `{}` silenciosamente — usuário aprovaria
  // modal com input vazio sem saber que o broker recebeu dados malformados.
  try {
    const result = JSON.stringify(input);
    // Se o resultado é `'{}'` mas input não é vazio, pode ser Map/Set/DataView.
    if (result === '{}' && Object.keys(input).length > 0) {
      log.warn(
        { inputKeys: Object.keys(input), inputTypes: Object.values(input).map((v) => typeof v) },
        'safeJson: input serializado como {} — possível Map/Set/DataView não serializável',
      );
    }
    return result;
  } catch {
    // BigInt, circular — hashArgs já rejeita circulares; BigInt vira string.
    // Qualquer outro caso: retorna {} com log warn para rastreabilidade.
    log.warn({ inputKeys: Object.keys(input) }, 'safeJson: JSON.stringify falhou; returning {}');
    return '{}';
  }
}
