import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions.ts';

export const attachments = sqliteTable('attachments', {
  hash: text('hash').primaryKey(), // SHA-256 do conteúdo
  size: integer('size').notNull(),
  mimeType: text('mime_type').notNull(),
  refCount: integer('ref_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  lastAccessedAt: integer('last_accessed_at').notNull(),
});

// `sessionId` precisa de FK + ON DELETE CASCADE — sem isso, ao deletar
// uma sessão, os refs ficam órfãos apontando para `sessions.id` que não existe
// mais. O refcount em `attachments` continua > 0 (refs órfãs ainda contam) →
// o GC nunca remove os blobs reais → disco vaza monotônico.
//
// `hash` mantém comportamento NO ACTION (default Drizzle): bloqueia deletar
// um attachment se algum ref ainda aponta pra ele — desejado, garante que o
// gateway respeite refcount.
export const attachmentRefs = sqliteTable('attachment_refs', {
  id: text('id').primaryKey(),
  hash: text('hash')
    .notNull()
    .references(() => attachments.hash),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id, { onDelete: 'cascade' }),
  messageId: text('message_id'),
  originalName: text('original_name').notNull(),
  createdAt: integer('created_at').notNull(),
});
