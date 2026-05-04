/**
 * Replay: reconstrói projections a partir do log de eventos JSONL.
 *
 * Dois modos:
 *   - `rebuildProjection` — full rebuild de uma sessão: apaga linhas
 *     existentes em `sessions`/`messages_index`/`event_checkpoints` e
 *     reaplica todos os eventos do JSONL.
 *   - `catchUp` — aplica apenas eventos com `sequenceNumber > lastSequence`
 *     (onde `lastSequence` vem de `event_checkpoints`). Usado em boot
 *     pós-crash para retomar do último commit.
 *
 * Garantia: ambos são idempotentes para um log de eventos imutável.
 */

import type { SessionEvent } from '@g4os/kernel/schemas';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { AppDb } from '../drizzle.ts';
import { eventCheckpoints } from '../schema/event-checkpoints.ts';
import { messagesIndex } from '../schema/messages-index.ts';
import { sessions } from '../schema/sessions.ts';
import type { SessionEventStore } from './event-store.ts';
import { applyEvent } from './reducer.ts';

const CONSUMER_NAME = 'messages-index';

export async function rebuildProjection(
  db: AppDb,
  store: SessionEventStore,
  sessionId: string,
): Promise<number> {
  // F-CR36-1: substituir `tx.delete(sessions)` por reset dos campos derivados.
  // `DELETE FROM sessions` cascateia via ON DELETE CASCADE para
  // `attachment_refs` e `session_labels` — rebuild perdia attachments e labels
  // permanentemente (incluindo em restore de backup via import.ts:80).
  // `attachment_refs`/`session_labels` não estão no event log JSONL (são
  // state-side, não event-sourced), portanto não devem ser tocados aqui.
  // Estratégia: reset apenas os campos que o reducer recompõe a partir dos
  // eventos; preservar pinnedAt/starredAt/enabledSourceSlugsJson/labels/refs.
  db.transaction((tx) => {
    tx.delete(messagesIndex).where(eq(messagesIndex.sessionId, sessionId)).run();
    tx.delete(eventCheckpoints).where(eq(eventCheckpoints.sessionId, sessionId)).run();
    // Reseta apenas o que o reducer reconstrói — preserva attachment_refs e
    // session_labels (cascade) + flags persistidos fora do event log.
    tx.update(sessions)
      .set({ messageCount: 0, lastMessageAt: null, lastEventSequence: 0, updatedAt: Date.now() })
      .where(eq(sessions.id, sessionId))
      .run();
  });

  // F-CR36-2: todos os eventos em uma única transação em vez de N transactions.
  // Antes: applyEvent abria 1 tx por evento → N fsyncs WAL em replay de 10k eventos
  // → boot pós-crash de ~20-50s em SSD. Agora: batch único = 1 fsync WAL.
  const events: SessionEvent[] = [];
  for await (const event of store.read(sessionId)) {
    events.push(event);
  }
  if (events.length > 0) {
    db.transaction((tx) => {
      for (const event of events) {
        applyEvent(tx, event);
      }
    });
  }
  return events.length;
}

export async function catchUp(
  db: AppDb,
  store: SessionEventStore,
  sessionId: string,
): Promise<number> {
  const row = db
    .select({ lastSequence: eventCheckpoints.lastSequence })
    .from(eventCheckpoints)
    .where(
      sql`${eventCheckpoints.consumerName} = ${CONSUMER_NAME} AND ${eventCheckpoints.sessionId} = ${sessionId}`,
    )
    .get();

  const from = row?.lastSequence ?? -1;
  const pending = await store.readAfter(sessionId, from);
  // F-CR36-2: batch dentro de uma única transação — N fsyncs → 1.
  if (pending.length > 0) {
    db.transaction((tx) => {
      for (const event of pending) applyEvent(tx, event);
    });
  }
  return pending.length;
}

/**
 * Trunca a projeção SQLite após `SessionEventStore.truncateAfter` ter
 * removido entradas do JSONL. Usado por `retryLastTurn`/`truncateAfter`
 * Remove linhas de `messages_index` com sequence > cutoff,
 * recalcula `messageCount`/`lastMessageAt` e reposiciona o checkpoint do
 * consumer `messages-index`.
 *
 * A row de `sessions` é preservada — campos sem ligação com o log
 * append-only (pinnedAt, starredAt, enabledSourceSlugs, etc.) não são
 * tocados. Só `lastEventSequence`, `messageCount`, `lastMessageAt` e
 * `updatedAt` são recomputados.
 */
export function truncateProjection(db: AppDb, sessionId: string, afterSequence: number): void {
  db.transaction((tx) => {
    tx.delete(messagesIndex)
      .where(and(eq(messagesIndex.sessionId, sessionId), gt(messagesIndex.sequence, afterSequence)))
      .run();

    const stats = tx
      .select({
        count: sql<number>`count(*)`,
        lastCreated: sql<number | null>`max(${messagesIndex.createdAt})`,
      })
      .from(messagesIndex)
      .where(eq(messagesIndex.sessionId, sessionId))
      .get();

    tx.update(sessions)
      .set({
        lastEventSequence: Math.max(0, afterSequence),
        messageCount: Number(stats?.count ?? 0),
        lastMessageAt: stats?.lastCreated ?? null,
        updatedAt: Date.now(),
      })
      .where(eq(sessions.id, sessionId))
      .run();

    tx.insert(eventCheckpoints)
      .values({
        consumerName: CONSUMER_NAME,
        sessionId,
        lastSequence: afterSequence,
        checkpointedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: [eventCheckpoints.consumerName, eventCheckpoints.sessionId],
        set: { lastSequence: afterSequence, checkpointedAt: Date.now() },
      })
      .run();
  });
}
