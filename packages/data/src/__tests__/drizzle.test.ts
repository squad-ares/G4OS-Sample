import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AppDb,
  createDrizzle,
  Db,
  eventCheckpoints,
  messagesIndex,
  sessions,
  workspaces,
} from '../index.ts';
import { applyFtsSchema } from '../schema/sessions-fts.ts';

const NOW = 1_700_000_000_000;

describe('Drizzle + node:sqlite', () => {
  let db: Db;
  let drizzle: AppDb;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-drizzle-'));
    db = new Db();
    await db.open({ filename: join(tmpDir, 'test.db') });
    applyBaselineSchema(db);
    applyFtsSchema(db);
    drizzle = createDrizzle(db);
  });

  afterEach(async () => {
    db.dispose();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('insert + select workspace returns inferred type', () => {
    drizzle
      .insert(workspaces)
      .values({
        id: 'ws-1',
        name: 'My Workspace',
        slug: 'my-workspace',
        rootPath: '/tmp/my-workspace',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();

    const rows = drizzle.select().from(workspaces).where(eq(workspaces.id, 'ws-1')).all();

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.slug).toBe('my-workspace');
    expect(row?.metadata).toBe('{}');
  });

  it('session FK enforces onDelete cascade', () => {
    drizzle
      .insert(workspaces)
      .values({
        id: 'ws-2',
        name: 'Workspace 2',
        slug: 'ws-2',
        rootPath: '/tmp/ws-2',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();

    drizzle
      .insert(sessions)
      .values({
        id: 'sess-1',
        workspaceId: 'ws-2',
        name: 'Session A',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();

    drizzle.delete(workspaces).where(eq(workspaces.id, 'ws-2')).run();

    const remaining = drizzle.select().from(sessions).all();
    expect(remaining).toEqual([]);
  });

  it('rejects session with non-existent workspaceId (FK)', () => {
    expect(() =>
      drizzle
        .insert(sessions)
        .values({
          id: 'sess-2',
          workspaceId: 'nonexistent',
          name: 'Session B',
          createdAt: NOW,
          updatedAt: NOW,
        })
        .run(),
    ).toThrow(/FOREIGN KEY/i);
  });

  it('sessions_status check constraint via enum', () => {
    drizzle
      .insert(workspaces)
      .values({
        id: 'ws-3',
        name: 'Workspace 3',
        slug: 'ws-3',
        rootPath: '/tmp/ws-3',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();

    drizzle
      .insert(sessions)
      .values({
        id: 'sess-3',
        workspaceId: 'ws-3',
        name: 'S',
        status: 'archived',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();

    const row = drizzle.select().from(sessions).where(eq(sessions.id, 'sess-3')).get();
    expect(row?.status).toBe('archived');
  });

  it('messages_index unique (session_id, sequence)', () => {
    seed(drizzle);
    drizzle
      .insert(messagesIndex)
      .values({
        id: 'm-1',
        sessionId: 'sess-seed',
        sequence: 1,
        role: 'user',
        contentPreview: 'hello',
        createdAt: NOW,
      })
      .run();

    expect(() =>
      drizzle
        .insert(messagesIndex)
        .values({
          id: 'm-2',
          sessionId: 'sess-seed',
          sequence: 1,
          role: 'assistant',
          contentPreview: 'hi',
          createdAt: NOW,
        })
        .run(),
    ).toThrow(/UNIQUE/i);
  });

  it('event_checkpoints uses composite PK (consumer, session)', () => {
    seed(drizzle);
    drizzle
      .insert(eventCheckpoints)
      .values({
        consumerName: 'messages-index',
        sessionId: 'sess-seed',
        lastSequence: 10,
        checkpointedAt: NOW,
      })
      .run();

    drizzle
      .insert(eventCheckpoints)
      .values({
        consumerName: 'fts-indexer',
        sessionId: 'sess-seed',
        lastSequence: 5,
        checkpointedAt: NOW,
      })
      .run();

    const rows = drizzle.select().from(eventCheckpoints).all();
    expect(rows).toHaveLength(2);
  });

  it('indices exist for sessions (workspace, last_message, status)', () => {
    const idx = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='sessions'`)
      .all() as Array<{ name: string }>;
    const names = idx.map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'idx_sessions_workspace',
        'idx_sessions_last_message',
        'idx_sessions_status',
      ]),
    );
  });

  it('FTS5 virtual table is populated by trigger', () => {
    seed(drizzle);
    drizzle
      .insert(messagesIndex)
      .values({
        id: 'm-fts-1',
        sessionId: 'sess-seed',
        sequence: 1,
        role: 'user',
        contentPreview: 'the quick brown fox jumps',
        createdAt: NOW,
      })
      .run();

    const matches = drizzle
      .select({ preview: messagesIndex.contentPreview })
      .from(messagesIndex)
      .where(
        sql`${messagesIndex.id} IN (SELECT mi.id FROM messages_index mi JOIN messages_fts f ON mi.rowid = f.rowid WHERE f.content_preview MATCH ${'quick'})`,
      )
      .all();

    expect(matches).toHaveLength(1);
    expect(matches[0]?.preview).toContain('quick');
  });

  it('FTS5 respects delete trigger', () => {
    seed(drizzle);
    drizzle
      .insert(messagesIndex)
      .values({
        id: 'm-fts-del',
        sessionId: 'sess-seed',
        sequence: 1,
        role: 'user',
        contentPreview: 'zebra striped pattern',
        createdAt: NOW,
      })
      .run();

    drizzle
      .delete(messagesIndex)
      .where(and(eq(messagesIndex.id, 'm-fts-del')))
      .run();

    const row = db
      .prepare('SELECT COUNT(*) AS c FROM messages_fts WHERE messages_fts MATCH ?')
      .get('zebra') as { c: number } | undefined;
    expect(row?.c).toBe(0);
  });
});

/**
 * Baseline schema aplicado inline nos testes. Em produção isso virá
 * das migrations geradas por drizzle-kit (TASK-04-03). Aqui reproduzimos
 * o DDL esperado para isolar TASK-04-02 da runner de migrations.
 */
function applyBaselineSchema(db: Db): void {
  db.exec(`
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      root_path TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      message_count INTEGER NOT NULL DEFAULT 0,
      last_message_at INTEGER,
      last_event_sequence INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      archived_at INTEGER,
      deleted_at INTEGER,
      parent_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      branched_at_seq INTEGER,
      pinned_at INTEGER,
      starred_at INTEGER,
      unread INTEGER NOT NULL DEFAULT 0,
      project_id TEXT,
      provider TEXT,
      model_id TEXT,
      working_directory TEXT,
      enabled_source_slugs_json TEXT NOT NULL DEFAULT '[]',
      sticky_source_slugs_json TEXT NOT NULL DEFAULT '[]',
      rejected_source_slugs_json TEXT NOT NULL DEFAULT '[]'
    );
    CREATE INDEX idx_sessions_workspace ON sessions(workspace_id, updated_at);
    CREATE INDEX idx_sessions_last_message ON sessions(last_message_at);
    CREATE INDEX idx_sessions_status ON sessions(status);
    CREATE INDEX idx_sessions_pinned ON sessions(workspace_id, pinned_at);
    CREATE INDEX idx_sessions_parent ON sessions(parent_id);

    CREATE TABLE messages_index (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL,
      role TEXT NOT NULL,
      content_preview TEXT NOT NULL,
      token_count INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX idx_messages_session_sequence ON messages_index(session_id, sequence);
    CREATE INDEX idx_messages_session_created ON messages_index(session_id, created_at);
    CREATE INDEX idx_messages_role ON messages_index(role);

    CREATE TABLE event_checkpoints (
      consumer_name TEXT NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      last_sequence INTEGER NOT NULL DEFAULT 0,
      checkpointed_at INTEGER NOT NULL,
      PRIMARY KEY (consumer_name, session_id)
    );

    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      root_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      color TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX idx_projects_workspace ON projects(workspace_id, status, updated_at);
    CREATE INDEX idx_projects_slug ON projects(workspace_id, slug);

    CREATE TABLE project_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      priority TEXT,
      assignee_id TEXT,
      due_at INTEGER,
      labels TEXT NOT NULL DEFAULT '[]',
      session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      "order" TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX idx_project_tasks_project ON project_tasks(project_id, status, "order");
    CREATE INDEX idx_project_tasks_session ON project_tasks(session_id);
  `);
}

function seed(drizzle: AppDb): void {
  drizzle
    .insert(workspaces)
    .values({
      id: 'ws-seed',
      name: 'Seed',
      slug: 'ws-seed',
      rootPath: '/tmp/ws-seed',
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();

  drizzle
    .insert(sessions)
    .values({
      id: 'sess-seed',
      workspaceId: 'ws-seed',
      name: 'Seed Session',
      createdAt: NOW,
      updatedAt: NOW,
    })
    .run();
}
