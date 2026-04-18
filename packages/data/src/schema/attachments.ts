import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const attachments = sqliteTable('attachments', {
  hash: text('hash').primaryKey(), // SHA-256 do conteúdo
  size: integer('size').notNull(),
  mimeType: text('mime_type').notNull(),
  refCount: integer('ref_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  lastAccessedAt: integer('last_accessed_at').notNull(),
});

export const attachmentRefs = sqliteTable('attachment_refs', {
  id: text('id').primaryKey(),
  hash: text('hash')
    .notNull()
    .references(() => attachments.hash),
  sessionId: text('session_id').notNull(),
  messageId: text('message_id'),
  originalName: text('original_name').notNull(),
  createdAt: integer('created_at').notNull(),
});
