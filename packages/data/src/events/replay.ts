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
  db.transaction((tx) => {
    tx.delete(messagesIndex).where(eq(messagesIndex.sessionId, sessionId)).run();
    tx.delete(eventCheckpoints).where(eq(eventCheckpoints.sessionId, sessionId)).run();
    tx.delete(sessions).where(eq(sessions.id, sessionId)).run();
  });

  let applied = 0;
  for await (const event of store.read(sessionId)) {
    applyEvent(db, event);
    applied += 1;
  }
  return applied;
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
  for (const event of pending) applyEvent(db, event);
  return pending.length;
}

/**
 * Trunca a projeção SQLite após `SessionEventStore.truncateAfter` ter
 * removido entradas do JSONL. Usado por `retryLastTurn`/`truncateAfter`
 * (FOLLOWUP-08): remove linhas de `messages_index` com sequence > cutoff,
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
