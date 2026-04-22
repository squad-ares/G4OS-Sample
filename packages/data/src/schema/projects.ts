import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { workspaces } from './workspaces.ts';

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    rootPath: text('root_path').notNull(),
    status: text('status', { enum: ['active', 'archived'] })
      .notNull()
      .default('active'),
    color: text('color'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('idx_projects_workspace').on(t.workspaceId, t.status, t.updatedAt),
    index('idx_projects_slug').on(t.workspaceId, t.slug),
  ],
);

export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
