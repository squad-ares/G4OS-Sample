/**
 * PermissionBroker — mediador entre tool calls do agent e decisão do usuário.
 *
 * Fluxo com persistência (OUTLIER-09 Phase 2):
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
  readonly workspaceId?: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export class PermissionBroker extends DisposableBase {
  readonly #pending = new Map<string, Pending>();
  /** Cache `allow_session` por sessão: set de `${toolName}:${argsHash}`. */
  readonly #sessionAllow = new Map<string, Set<string>>();
  readonly #onRequest: (req: PermissionRequest) => void;
  readonly #store: PermissionStore | undefined;

  constructor(
    onRequest: (req: PermissionRequest) => void,
    options: { readonly store?: PermissionStore } = {},
  ) {
    super();
    this.#onRequest = onRequest;
    if (options.store) this.#store = options.store;
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
    return new Promise<PermissionDecision>((resolve, reject) => {
      this.#pending.set(requestId, {
        resolve,
        reject,
        request,
        argsHash,
        ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
        input: input.input,
      });
      try {
        this.#onRequest(request);
      } catch (err) {
        this.#pending.delete(requestId);
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      log.info(
        { requestId, sessionId: input.sessionId, toolName: input.toolName },
        'permission requested',
      );
    });
  }

  respond(requestId: string, decision: PermissionDecision): boolean {
    const pending = this.#pending.get(requestId);
    if (!pending) {
      log.warn({ requestId }, 'respond called for unknown permission request');
      return false;
    }
    this.#pending.delete(requestId);
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
      const workspaceId = pending.workspaceId;
      void this.#store
        .persist(workspaceId, {
          toolName: pending.request.toolName,
          args: pending.input,
        })
        .catch((err: unknown) => {
          log.warn({ err, toolName: pending.request.toolName }, 'failed to persist allow_always');
        });
    }

    pending.resolve(decision);
    return true;
  }

  cancel(sessionId: string): void {
    for (const [id, pending] of this.#pending) {
      if (pending.request.sessionId !== sessionId) continue;
      this.#pending.delete(id);
      pending.reject(new Error('permission request cancelled'));
    }
    this.#sessionAllow.delete(sessionId);
  }

  override dispose(): void {
    if (this._disposed) return;
    for (const [, pending] of this.#pending) {
      pending.reject(new Error('permission broker disposed'));
    }
    this.#pending.clear();
    this.#sessionAllow.clear();
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
