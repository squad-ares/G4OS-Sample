/**
 * SessionEventBus — pub/sub por `sessionId` para eventos de sessão.
 *
 * Independente do worker. `SessionsService.subscribe` + tRPC `sessions.stream`
 * leem daqui, e `TurnDispatcher` publica aqui. No futuro, o session worker
 * também publica via bridge.
 *
 * Além de eventos persistidos (`SessionEvent` discriminated union), o bus
 * transporta eventos transientes de turn streaming (`TurnTextChunk`, etc.)
 * que não vão pro event log — são apenas para UI acompanhar streaming.
 */

import { DisposableBase, type IDisposable, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type { SessionEvent } from '@g4os/kernel/types';

const log = createLogger('session-event-bus');

export interface TurnStartedEvent {
  readonly type: 'turn.started';
  readonly sessionId: string;
  readonly turnId: string;
}

export interface TurnTextChunkEvent {
  readonly type: 'turn.text_chunk';
  readonly sessionId: string;
  readonly turnId: string;
  readonly text: string;
}

export interface TurnThinkingChunkEvent {
  readonly type: 'turn.thinking_chunk';
  readonly sessionId: string;
  readonly turnId: string;
  readonly text: string;
}

export interface TurnDoneEvent {
  readonly type: 'turn.done';
  readonly sessionId: string;
  readonly turnId: string;
  readonly reason: 'stop' | 'max_tokens' | 'tool_use' | 'interrupted' | 'error';
}

export interface TurnErrorEvent {
  readonly type: 'turn.error';
  readonly sessionId: string;
  readonly turnId: string;
  readonly code: string;
  readonly message: string;
}

export interface TurnPermissionRequiredEvent {
  readonly type: 'turn.permission_required';
  readonly sessionId: string;
  readonly turnId: string;
  readonly requestId: string;
  readonly toolUseId: string;
  readonly toolName: string;
  readonly inputJson: string;
}

export interface TurnToolUseStartedEvent {
  readonly type: 'turn.tool_use_started';
  readonly sessionId: string;
  readonly turnId: string;
  readonly toolUseId: string;
  readonly toolName: string;
  readonly inputJson: string;
}

export interface TurnToolUseCompletedEvent {
  readonly type: 'turn.tool_use_completed';
  readonly sessionId: string;
  readonly turnId: string;
  readonly toolUseId: string;
  readonly toolName: string;
  readonly ok: boolean;
}

/**
 * Evento interno — NÃO atravessa tRPC. Emitido pelo `TurnDispatcher` ao
 * finalizar um turn para que consumidores main-side persistam a mensagem
 * do assistant no índice SQLite e no event log JSONL.
 */
export interface TurnCompleteEvent {
  readonly type: 'turn.complete';
  readonly sessionId: string;
  readonly turnId: string;
  readonly reason: 'stop' | 'max_tokens' | 'tool_use' | 'interrupted' | 'error';
  readonly text: string;
  readonly thinking: string;
  readonly usage: { readonly input: number; readonly output: number };
  readonly modelId: string;
}

export type SessionBusEvent =
  | SessionEvent
  | TurnStartedEvent
  | TurnTextChunkEvent
  | TurnThinkingChunkEvent
  | TurnDoneEvent
  | TurnErrorEvent
  | TurnCompleteEvent
  | TurnPermissionRequiredEvent
  | TurnToolUseStartedEvent
  | TurnToolUseCompletedEvent;

export type SessionBusHandler = (event: SessionBusEvent) => void;

export class SessionEventBus extends DisposableBase {
  readonly #listeners = new Map<string, Set<SessionBusHandler>>();

  constructor() {
    super();
    this._register(toDisposable(() => this.#listeners.clear()));
  }

  subscribe(sessionId: string, handler: SessionBusHandler): IDisposable {
    let set = this.#listeners.get(sessionId);
    if (!set) {
      set = new Set();
      this.#listeners.set(sessionId, set);
    }
    set.add(handler);
    return toDisposable(() => {
      const current = this.#listeners.get(sessionId);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) this.#listeners.delete(sessionId);
    });
  }

  emit(sessionId: string, event: SessionBusEvent): void {
    const set = this.#listeners.get(sessionId);
    if (!set || set.size === 0) return;
    for (const handler of [...set]) {
      try {
        handler(event);
      } catch (err) {
        // Falha em um handler não pode afetar outros subscribers. Log em debug
        // so operators can diagnose via structured logs without noise.
        log.debug({ err, sessionId, eventType: event.type }, 'bus handler threw; isolated');
      }
    }
  }

  listenerCount(sessionId: string): number {
    return this.#listeners.get(sessionId)?.size ?? 0;
  }
}
