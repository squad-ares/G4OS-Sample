/**
 * Labels hierárquicos por workspace (TASK-11-01-07). `parentId` forma a
 * árvore; `treeCode` guarda o caminho materialized-path (`root.child.leaf`)
 * para filtros prefix-based ("todos sob Área") sem recursive CTE.
 *
 * `sessionLabels` é a junction many-to-many. Chave composta (session_id,
 * label_id) dedup automático; FK cascade limpa vínculos quando a label ou
 * sessão deixam de existir.
 *
 * Cores são strings livres (hex) para a UI; não forçamos paleta no schema
 * para que a feature possa evoluir sem migração.
 */

import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sessions } from './sessions.ts';
import { workspaces } from './workspaces.ts';

export const labels = sqliteTable(
  'labels',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    parentId: text('parent_id').references((): AnySQLiteColumn => labels.id, {
      onDelete: 'cascade',
    }),
    name: text('name').notNull(),
    color: text('color'),
    treeCode: text('tree_code').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    index('idx_labels_workspace').on(t.workspaceId),
    index('idx_labels_parent').on(t.parentId),
    index('idx_labels_tree_code').on(t.workspaceId, t.treeCode),
  ],
);

export type Label = typeof labels.$inferSelect;
export type NewLabel = typeof labels.$inferInsert;

export const sessionLabels = sqliteTable(
  'session_labels',
  {
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    labelId: text('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
    attachedAt: integer('attached_at').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.labelId] }),
    index('idx_session_labels_label').on(t.labelId),
  ],
);

export type SessionLabel = typeof sessionLabels.$inferSelect;
export type NewSessionLabel = typeof sessionLabels.$inferInsert;
