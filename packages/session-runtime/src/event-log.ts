/**
 * Pequenos helpers em torno do `SessionEventStore` para publicar eventos
 * de lifecycle e converter entre o protocolo interno de branching e
 * o contract do event store.
 *
 * `appendLifecycleEvent` aceita o *kind* (discriminante) e monta os
 * campos obrigatórios (`eventId`, `sequenceNumber`, `timestamp`) antes
 * de entregar ao schema — callers não precisam conhecer a estrutura.
 *
 * Callers com acesso ao `AppDb` devem preferir `emitLifecycleEvent`,
 * que passa pelo reducer e mantém `sessions.lastEventSequence` (SQLite)
 * em sync com o JSONL — ver ADR-0010/0043 (FOLLOWUP-04).
 */

import { randomUUID } from 'node:crypto';
import { SessionEventStore } from '@g4os/data/events';
import { createLogger } from '@g4os/kernel/logger';
import type { SessionEvent, SessionId, WorkspaceId } from '@g4os/kernel/types';

const log = createLogger('sessions-service:event-log');

export type LifecycleEventKind = Extract<
  SessionEvent['type'],
  'session.archived' | 'session.deleted' | 'session.renamed' | 'session.flagged'
>;

export function buildLifecycleEvent(
  sessionId: SessionId,
  kind: LifecycleEventKind,
  sequenceNumber: number,
  extra: Partial<SessionEvent> = {},
): SessionEvent {
  return buildEvent(sessionId, kind, sequenceNumber, extra);
}

export async function appendLifecycleEvent(
  workspaceId: WorkspaceId,
  sessionId: SessionId,
  kind: LifecycleEventKind,
  sequenceNumber: number,
  extra: Partial<SessionEvent> = {},
  eventStore?: Pick<SessionEventStore, 'append'>,
): Promise<SessionEvent | null> {
  try {
    const store = eventStore ?? new SessionEventStore(workspaceId);
    const event = buildEvent(sessionId, kind, sequenceNumber, extra);
    await store.append(sessionId, event);
    return event;
  } catch (error) {
    log.warn({ err: error, workspaceId, sessionId, kind }, 'session event append failed');
    return null;
  }
}

/**
 * Variante que também propaga o evento pelo reducer SQLite. Usar quando
 * o caller tem acesso ao `AppDb` — ela evita que `sessions.lastEventSequence`
 * fique desalinhado do JSONL após archive/delete/flag.
 */
export async function emitLifecycleEvent(
  deps: {
    readonly workspaceId: WorkspaceId;
    readonly currentSequence: number;
    readonly applyReducer: (event: SessionEvent) => void;
    readonly eventStore?: Pick<SessionEventStore, 'append'>;
  },
  sessionId: SessionId,
  kind: LifecycleEventKind,
  extra: Partial<SessionEvent> = {},
): Promise<SessionEvent | null> {
  const nextSequence = deps.currentSequence + 1;
  const event = await appendLifecycleEvent(
    deps.workspaceId,
    sessionId,
    kind,
    nextSequence,
    extra,
    deps.eventStore,
  );
  if (!event) return null;
  try {
    deps.applyReducer(event);
  } catch (error) {
    log.warn(
      { err: error, sessionId, kind, sequence: nextSequence },
      'lifecycle reducer sync failed (JSONL já persistido)',
    );
  }
  return event;
}

export async function appendCreatedEvent(
  workspaceId: WorkspaceId,
  sessionId: SessionId,
  name: string,
  createdBy: string,
): Promise<void> {
  try {
    const store = new SessionEventStore(workspaceId);
    const event: SessionEvent = {
      eventId: randomUUID(),
      sessionId,
      sequenceNumber: 0,
      timestamp: Date.now(),
      type: 'session.created',
      workspaceId,
      name,
      createdBy,
    };
    await store.append(sessionId, event);
  } catch (error) {
    log.warn({ err: error, workspaceId, sessionId }, 'session.created event append failed');
  }
}

export function eventStoreReader(store: SessionEventStore) {
  return {
    async *readReplay(sessionId: string) {
      let sequence = 0;
      for await (const event of store.read(sessionId)) {
        sequence += 1;
        yield { sequence, payload: event };
      }
    },
  };
}

/**
 * @internal Wrapper experimental — não usado em produção.
 *
 * Limitações conhecidas (CR5-09):
 * - `event.payload` é cast direto para `SessionEvent` sem validação Zod;
 *   caller deve garantir que o payload já passou pelo schema antes.
 * - Retorna `{ sequence: 0 }` placeholder. Callers que precisam do
 *   sequence real devem usar `appendLifecycleEvent` / `emitLifecycleEvent`
 *   diretamente, que leem `session.lastEventSequence + 1` e propagam.
 *
 * Mantido apenas para compatibilidade com testes antigos que esperam
 * a interface `{ append(sessionId, event): { sequence } }`. Não usar
 * em código novo — preferir `appendLifecycleEvent`.
 */
export function eventStoreWriter(store: SessionEventStore) {
  return {
    async append(sessionId: string, event: { readonly type: string; readonly payload?: unknown }) {
      const normalized = (event.payload ?? { type: event.type, at: Date.now() }) as SessionEvent;
      await store.append(sessionId, normalized);
      // Sequence real exige acesso ao SQLite projection; este wrapper é
      // file-only — caller deve usar appendLifecycleEvent para sequence.
      return { sequence: 0 } as const;
    },
  };
}

function buildEvent(
  sessionId: SessionId,
  kind: LifecycleEventKind,
  sequenceNumber: number,
  extra: Partial<SessionEvent>,
): SessionEvent {
  const base = {
    eventId: randomUUID(),
    sessionId,
    sequenceNumber,
    timestamp: Date.now(),
  };
  if (kind === 'session.renamed') {
    return {
      ...base,
      type: 'session.renamed',
      newName: (extra as { newName?: string }).newName ?? '',
    };
  }
  if (kind === 'session.flagged') {
    const reason = (extra as { reason?: string }).reason;
    return {
      ...base,
      type: 'session.flagged',
      ...(reason === undefined ? {} : { reason }),
    };
  }
  if (kind === 'session.archived') {
    return { ...base, type: 'session.archived' };
  }
  return { ...base, type: 'session.deleted' };
}
