/**
 * Índice de mensagens — projeção compacta para listagem/busca. Fonte de
 * verdade continua no JSONL de eventos por sessão (ADR-0010). Esta tabela
 * carrega apenas o que precisa ir para UI de listagem + FTS.
 *
 * `contentPreview` é truncado para ~200 chars; a mensagem completa fica
 * no evento JSONL. `sequence` reflete a ordem dentro da sessão.
 */

import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions.ts';

export const messagesIndex = sqliteTable(
  'messages_index',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    role: text('role', { enum: ['user', 'assistant', 'system', 'tool'] }).notNull(),
    contentPreview: text('content_preview').notNull(),
    tokenCount: integer('token_count'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [
    uniqueIndex('idx_messages_session_sequence').on(t.sessionId, t.sequence),
    index('idx_messages_session_created').on(t.sessionId, t.createdAt),
    index('idx_messages_role').on(t.role),
  ],
);

export type MessageIndex = typeof messagesIndex.$inferSelect;
export type NewMessageIndex = typeof messagesIndex.$inferInsert;
