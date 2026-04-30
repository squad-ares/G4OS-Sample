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

  constructor(
    onRequest: (req: PermissionRequest) => void,
    options: {
      readonly store?: PermissionStore;
      /** Override timeout em testes. Default 5min. */
      readonly requestTimeoutMs?: number;
    } = {},
  ) {
    super();
    this.#onRequest = onRequest;
    if (options.store) this.#store = options.store;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
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

    // Emitir callback ANTES de configurar pending. Se onRequest
    // throw (renderer crashed, IPC down), retornamos 'deny' fail-safe
    // direto — nunca deixamos pendência órfã esperando resposta que não vai
    // chegar. Antes: pendência era inserida primeiro, callback ficava
    // dentro de try/catch DEPOIS de adicionar — isso causava memory leak
    // quando callback throw + race window com tool-loop esperando.
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
      return 'deny';
    }

    const promise = new Promise<PermissionDecision>((resolve, reject) => {
      // Timeout interno — auto-deny + cleanup se pendência não
      // resolver dentro de #requestTimeoutMs. Sem isso, request abandonado
      // (turn cancelado sem ack do user) acumula em #pending para sempre.
      const timeoutHandle = setTimeout(() => {
        if (this.#pending.has(requestId)) {
          log.warn(
            { requestId, toolName: input.toolName, timeoutMs: this.#requestTimeoutMs },
            'permission request timed out; auto-denying',
          );
          this.#pending.delete(requestId);
          this.#coalesce.delete(coalesceKey);
          resolve('deny');
        }
      }, this.#requestTimeoutMs);
      // `unref()` pode não existir em runtimes exóticos (worker_threads
      // edge cases, alguns shims). Fallback log para operador investigar; o
      // dispose() já limpa o timer explicitamente, então o pior caso é
      // process aguardando timer no quit.
      try {
        timeoutHandle.unref?.();
      } catch (err) {
        log.warn(
          { err: String(err) },
          'permission timeout handle.unref failed; rely on dispose() for cleanup',
        );
      }

      this.#pending.set(requestId, {
        resolve,
        reject,
        request,
        argsHash,
        coalesceKey,
        timeoutHandle,
        ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
        input: input.input,
      });
      log.info(
        { requestId, sessionId: input.sessionId, toolName: input.toolName },
        'permission requested',
      );
    });
    this.#coalesce.set(coalesceKey, promise);
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

    // Side-effects antes de resolver a promise.
    if (decision === 'allow_session') {
      sessionAllowAdd(
        this.#sessionAllow,
        pending.request.sessionId,
        pending.request.toolName,
        pending.argsHash,
      );
    } else if (decision === 'allow_always' && this.#store && pending.workspaceId) {
      // Await persist + fsync ANTES de resolver. Antes era
      // fire-and-forget — se app crashasse entre `persist()` retornar e
      // `writeAtomic` flushar, decisão `allow_always` se perdia. Latência
      // adicional é aceita: usuário acabou de clicar "Always", está
      // esperando o tool rodar; janela de poucos ms para fsync é
      // imperceptível e garante que próximo turn não pergunta de novo.
      try {
        await this.#store.persist(pending.workspaceId, {
          toolName: pending.request.toolName,
          args: pending.input,
        });
      } catch (err) {
        log.warn(
          { err, toolName: pending.request.toolName },
          'failed to persist allow_always — proceeding with allow_once for current turn',
        );
      }
    }

    pending.resolve(decision);
    return true;
  }

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
  try {
    return JSON.stringify(input);
  } catch {
    return '{}';
  }
}
