/**
 * Workspace = raiz do escopo do usuário. Cada workspace tem seu próprio
 * diretório em disco, credenciais, preferências e catálogo de sessões.
 *
 * `metadata` guarda JSON arbitrário (feature flags por-workspace, flavors
 * experimentais). `rootPath` aponta para o diretório no filesystem.
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  rootPath: text('root_path').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  metadata: text('metadata').notNull().default('{}'),
});

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
