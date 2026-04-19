/**
 * Checkpoint de consumo de eventos. Cada projeção (sessions,
 * messages_index, fts) avança um cursor por (consumerName, sessionId).
 * No boot, replay lê eventos com sequence > lastSequence.
 *
 * `consumerName` permite múltiplas projeções independentes consumindo
 * o mesmo stream de eventos em ritmos distintos.
 */

import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions.ts';

export const eventCheckpoints = sqliteTable(
  'event_checkpoints',
  {
    consumerName: text('consumer_name').notNull(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    lastSequence: integer('last_sequence').notNull().default(0),
    checkpointedAt: integer('checkpointed_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.consumerName, t.sessionId] })],
);

export type EventCheckpoint = typeof eventCheckpoints.$inferSelect;
export type NewEventCheckpoint = typeof eventCheckpoints.$inferInsert;
