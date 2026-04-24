import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { projects } from './projects.ts';
import { sessions } from './sessions.ts';

export const projectTasks = sqliteTable(
  'project_tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status', { enum: ['todo', 'in_progress', 'blocked', 'done'] })
      .notNull()
      .default('todo'),
    priority: text('priority', { enum: ['low', 'medium', 'high', 'urgent'] }),
    assigneeId: text('assignee_id'),
    dueAt: integer('due_at'),
    labels: text('labels').notNull().default('[]'),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'set null' }),
    order: text('order').notNull(),
    createdAt: integer('created_at').notNull(),
    completedAt: integer('completed_at'),
  },
  (t) => [
    index('idx_project_tasks_project').on(t.projectId, t.status, t.order),
    index('idx_project_tasks_session').on(t.sessionId),
  ],
);

export type ProjectTaskRow = typeof projectTasks.$inferSelect;
export type NewProjectTaskRow = typeof projectTasks.$inferInsert;
