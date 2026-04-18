/**
 * Catálogo de sessões. Projeção derivada do log de eventos JSONL append-only
 * (ADR-0010) — não é fonte de verdade, é índice para listagem/busca.
 *
 * `lastEventSequence` é o cursor de replay: recovery após crash lê os
 * eventos com sequence > lastEventSequence e recompõe o estado. `status`
 * reflete soft-delete/arquivamento; sessão deletada permanece em JSONL.
 */

import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { workspaces } from './workspaces.ts';

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    status: text('status', { enum: ['active', 'archived', 'deleted'] })
      .notNull()
      .default('active'),
    messageCount: integer('message_count').notNull().default(0),
    lastMessageAt: integer('last_message_at'),
    lastEventSequence: integer('last_event_sequence').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    metadata: text('metadata').notNull().default('{}'),
  },
  (t) => [
    index('idx_sessions_workspace').on(t.workspaceId, t.updatedAt),
    index('idx_sessions_last_message').on(t.lastMessageAt),
    index('idx_sessions_status').on(t.status),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
