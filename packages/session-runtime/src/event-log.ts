/**
 * Pequenos helpers em torno do `SessionEventStore` para publicar eventos
 * de lifecycle e converter entre o protocolo interno de branching e
 * o contract do event store.
 *
 * `appendLifecycleEvent` aceita o *kind* (discriminante) e monta os
 * campos obrigatórios (`eventId`, `sequenceNumber`, `timestamp`) antes
 * de entregar ao schema — callers não precisam conhecer a estrutura.
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

export async function appendLifecycleEvent(
  workspaceId: WorkspaceId,
  sessionId: SessionId,
  kind: LifecycleEventKind,
  sequenceNumber: number,
  extra: Partial<SessionEvent> = {},
): Promise<void> {
  try {
    const store = new SessionEventStore(workspaceId);
    const event = buildEvent(sessionId, kind, sequenceNumber, extra);
    await store.append(sessionId, event);
  } catch (error) {
    log.warn({ err: error, workspaceId, sessionId, kind }, 'session event append failed');
  }
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

export function eventStoreWriter(store: SessionEventStore) {
  return {
    async append(sessionId: string, event: { readonly type: string; readonly payload?: unknown }) {
      const normalized = (event.payload ?? { type: event.type, at: Date.now() }) as SessionEvent;
      await store.append(sessionId, normalized);
      return { sequence: 0 };
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
