/**
 * Catálogo de sessões. Projeção derivada do log de eventos JSONL append-only
 * (ADR-0010) — não é fonte de verdade, é índice para listagem/busca.
 *
 * `lastEventSequence` é o cursor de replay: recovery após crash lê os
 * eventos com sequence > lastEventSequence e recompõe o estado. `status`
 * reflete soft-delete/arquivamento; sessão deletada permanece em JSONL.
 *
 * Campos de lifecycle (TASK-11-01-06): `archivedAt`/`deletedAt` complementam
 * `status` para janela de restore (30d). `deletedAt IS NOT NULL AND now -
 * deletedAt > 30d` → candidato a hard-delete.
 *
 * Campos de branching (TASK-11-01-04): `parentId` aponta para a sessão-mãe
 * e `branchedAtSeq` marca o ponto de divergência. Branches são listadas na
 * view dedicada, filtradas (`parentId IS NULL`) da lista principal.
 *
 * Flags (TASK-11-01-07/08): `pinnedAt`/`starredAt` usam timestamp nullable
 * em vez de boolean para permitir sort estável por pin order. `unread` é
 * boolean simples porque não precisa de ordenação.
 */

import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
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

    archivedAt: integer('archived_at'),
    deletedAt: integer('deleted_at'),

    parentId: text('parent_id').references((): AnySQLiteColumn => sessions.id, {
      onDelete: 'set null',
    }),
    branchedAtSeq: integer('branched_at_seq'),

    pinnedAt: integer('pinned_at'),
    starredAt: integer('starred_at'),
    unread: integer('unread', { mode: 'boolean' }).notNull().default(false),

    projectId: text('project_id'),

    // TASK-OUTLIER-07: provider + modelo escolhidos pelo usuário nesta sessão.
    // Nullable — sessões antigas e novas iniciam sem escolha explícita e
    // TurnDispatcher aplica default (claude-sonnet-4-6 + anthropic-direct).
    provider: text('provider'),
    modelId: text('model_id'),

    // TASK-OUTLIER-19: diretório de trabalho escolhido pelo usuário. Tool
    // handlers usam este path como `ctx.workingDir`. Nullable — sessões
    // usam default do workspace (`workspace.defaults.workingDirectory`)
    // quando não definido.
    workingDirectory: text('working_directory'),

    // TASK-OUTLIER-10: estado de sources por sessão.
    // `enabled`: slugs que o usuário ativou explicitamente nesta sessão (subset
    //  do catálogo habilitado no workspace).
    // `sticky`: slugs que foram mountados via `activate_sources` e persistem
    //  entre reabrir sessão — o agente os considera disponíveis sem precisar
    //  reativar.
    // `rejected`: slugs que o usuário vetou no chat (ex: "don't use HubSpot") —
    //  planner não deve sugerir/mountar enquanto rejeitado.
    enabledSourceSlugsJson: text('enabled_source_slugs_json').notNull().default('[]'),
    stickyMountedSourceSlugsJson: text('sticky_source_slugs_json').notNull().default('[]'),
    rejectedSourceSlugsJson: text('rejected_source_slugs_json').notNull().default('[]'),
  },
  (t) => [
    index('idx_sessions_workspace').on(t.workspaceId, t.updatedAt),
    index('idx_sessions_last_message').on(t.lastMessageAt),
    index('idx_sessions_status').on(t.status),
    index('idx_sessions_workspace_status').on(t.workspaceId, t.status, t.updatedAt),
    index('idx_sessions_parent').on(t.parentId),
    index('idx_sessions_pinned').on(t.workspaceId, t.pinnedAt),
    index('idx_sessions_deleted_at').on(t.deletedAt),
  ],
);

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
