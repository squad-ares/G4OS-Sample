/**
 * Verifica que ON DELETE CASCADE está funcional para todas as entidades filhas
 * de um workspace: sessions, projects, labels, event_checkpoints, messages_index.
 *
 * SQLite exige PRAGMA foreign_keys = ON — habilitado pela classe Db (linha 167).
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AppDb,
  createDrizzle,
  Db,
  eventCheckpoints,
  messagesIndex,
  runMigrations,
  sessions,
  workspaces,
} from '../index.ts';
import { attachmentRefs, attachments } from '../schema/attachments.ts';
import { labels, sessionLabels } from '../schema/labels.ts';
import { projectTasks } from '../schema/project-tasks.ts';
import { projects } from '../schema/projects.ts';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

const NOW = 1_700_000_000_000;

function makeWorkspace(id: string) {
  return {
    id,
    name: `Workspace ${id}`,
    slug: id,
    rootPath: `/tmp/${id}`,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeSession(id: string, workspaceId: string) {
  return {
    id,
    workspaceId,
    name: `Session ${id}`,
    status: 'active' as const,
    messageCount: 0,
    lastEventSequence: 0,
    createdAt: NOW,
    updatedAt: NOW,
    enabledSourceSlugsJson: '[]',
    stickyMountedSourceSlugsJson: '[]',
    rejectedSourceSlugsJson: '[]',
  };
}

describe('workspace delete cascade', () => {
  let db: Db;
  let drizzle: AppDb;
  let tmpDir: string;

  const wsId = 'ws-cascade-test';
  const otherWsId = 'ws-other';
  const sessionId = 'sess-cascade-1';
  const otherSessionId = 'sess-other-1';
  const projectId = 'proj-cascade-1';
  const taskId = 'task-cascade-1';
  const labelId = 'label-cascade-1';

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-cascade-'));
    db = new Db();
    await db.open({ filename: join(tmpDir, 'app.db') });
    drizzle = createDrizzle(db);
    runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });

    // Seed: workspace alvo + outro workspace para verificar isolamento
    drizzle.insert(workspaces).values(makeWorkspace(wsId)).run();
    drizzle.insert(workspaces).values(makeWorkspace(otherWsId)).run();

    // Session no workspace alvo
    drizzle.insert(sessions).values(makeSession(sessionId, wsId)).run();
    // Session no outro workspace (não deve ser afetada)
    drizzle.insert(sessions).values(makeSession(otherSessionId, otherWsId)).run();

    // messages_index para a session do workspace alvo
    drizzle
      .insert(messagesIndex)
      .values({
        id: 'msg-1',
        sessionId,
        sequence: 1,
        role: 'user',
        contentPreview: 'hello',
        createdAt: NOW,
      })
      .run();

    // event_checkpoints para a session do workspace alvo
    drizzle
      .insert(eventCheckpoints)
      .values({
        consumerName: 'test',
        sessionId,
        lastSequence: 0,
        checkpointedAt: NOW,
      })
      .run();

    // Project + task no workspace alvo
    drizzle
      .insert(projects)
      .values({
        id: projectId,
        workspaceId: wsId,
        name: 'Test Project',
        slug: 'test-project',
        rootPath: `/tmp/${wsId}/projects/${projectId}`,
        status: 'active',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();

    drizzle
      .insert(projectTasks)
      .values({
        id: taskId,
        projectId,
        title: 'Test Task',
        status: 'todo',
        order: '0|aaaaaa',
        createdAt: NOW,
      })
      .run();

    // Label no workspace alvo
    drizzle
      .insert(labels)
      .values({
        id: labelId,
        workspaceId: wsId,
        treeCode: 'area',
        name: 'Test',
        color: '#ff0000',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();

    // session_labels vínculo
    drizzle.insert(sessionLabels).values({ sessionId, labelId, attachedAt: NOW }).run();
  });

  afterEach(async () => {
    db.dispose();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('deleta o workspace alvo', () => {
    drizzle.delete(workspaces).where(eq(workspaces.id, wsId)).run();
    const ws = drizzle.select().from(workspaces).where(eq(workspaces.id, wsId)).all();
    expect(ws).toHaveLength(0);
  });

  it('cascade: sessions do workspace são removidas', () => {
    drizzle.delete(workspaces).where(eq(workspaces.id, wsId)).run();
    const rows = drizzle.select().from(sessions).where(eq(sessions.id, sessionId)).all();
    expect(rows).toHaveLength(0);
  });

  it('cascade: messages_index das sessions são removidas', () => {
    drizzle.delete(workspaces).where(eq(workspaces.id, wsId)).run();
    const rows = drizzle
      .select()
      .from(messagesIndex)
      .where(eq(messagesIndex.sessionId, sessionId))
      .all();
    expect(rows).toHaveLength(0);
  });

  it('cascade: event_checkpoints das sessions são removidos', () => {
    drizzle.delete(workspaces).where(eq(workspaces.id, wsId)).run();
    const rows = drizzle
      .select()
      .from(eventCheckpoints)
      .where(eq(eventCheckpoints.sessionId, sessionId))
      .all();
    expect(rows).toHaveLength(0);
  });

  it('cascade: projects do workspace são removidos', () => {
    drizzle.delete(workspaces).where(eq(workspaces.id, wsId)).run();
    const rows = drizzle.select().from(projects).where(eq(projects.id, projectId)).all();
    expect(rows).toHaveLength(0);
  });

  it('cascade: project_tasks dos projects são removidas', () => {
    drizzle.delete(workspaces).where(eq(workspaces.id, wsId)).run();
    const rows = drizzle.select().from(projectTasks).where(eq(projectTasks.id, taskId)).all();
    expect(rows).toHaveLength(0);
  });

  it('cascade: labels do workspace são removidas', () => {
    drizzle.delete(workspaces).where(eq(workspaces.id, wsId)).run();
    const rows = drizzle.select().from(labels).where(eq(labels.id, labelId)).all();
    expect(rows).toHaveLength(0);
  });

  it('isolamento: session do outro workspace não é afetada', () => {
    drizzle.delete(workspaces).where(eq(workspaces.id, wsId)).run();
    const rows = drizzle.select().from(sessions).where(eq(sessions.id, otherSessionId)).all();
    expect(rows).toHaveLength(1);
  });

  // CR6-02 — sessions → attachment_refs cascade.
  // Antes do fix, refs ficavam órfãs e o GC nunca derrubava blobs.
  it('cascade: attachment_refs da session são removidas (CR6-02)', () => {
    const hash = 'sha256-test-cr6-02';
    drizzle
      .insert(attachments)
      .values({
        hash,
        size: 100,
        mimeType: 'text/plain',
        refCount: 1,
        createdAt: NOW,
        lastAccessedAt: NOW,
      })
      .run();
    drizzle
      .insert(attachmentRefs)
      .values({
        id: 'ref-cr6-02',
        hash,
        sessionId,
        originalName: 'test.txt',
        createdAt: NOW,
      })
      .run();

    drizzle.delete(sessions).where(eq(sessions.id, sessionId)).run();

    const refsAfter = drizzle
      .select()
      .from(attachmentRefs)
      .where(eq(attachmentRefs.sessionId, sessionId))
      .all();
    expect(refsAfter).toHaveLength(0);
    // O blob continua (refcount lógico ≠ FK) — gateway é quem decrementa e GC.
    const blobAfter = drizzle.select().from(attachments).where(eq(attachments.hash, hash)).all();
    expect(blobAfter).toHaveLength(1);
  });

  it('cascade indireto: workspace → session → attachment_refs (CR6-02)', () => {
    const hash = 'sha256-test-cr6-02-indirect';
    drizzle
      .insert(attachments)
      .values({
        hash,
        size: 100,
        mimeType: 'text/plain',
        refCount: 1,
        createdAt: NOW,
        lastAccessedAt: NOW,
      })
      .run();
    drizzle
      .insert(attachmentRefs)
      .values({
        id: 'ref-cr6-02-indirect',
        hash,
        sessionId,
        originalName: 'test.txt',
        createdAt: NOW,
      })
      .run();

    drizzle.delete(workspaces).where(eq(workspaces.id, wsId)).run();

    const refsAfter = drizzle
      .select()
      .from(attachmentRefs)
      .where(eq(attachmentRefs.sessionId, sessionId))
      .all();
    expect(refsAfter).toHaveLength(0);
  });

  // CR12-D7: attachment_refs.hash → attachments.hash usa NO ACTION (default
  // Drizzle), garantindo que delete direto de attachment com refs vivas
  // falha. O gateway decrementa refcount + apaga o blob só quando chega a
  // zero — esta FK é o último gate caso o gateway tenha bug.
  it('FK hash: bloqueia delete de attachment quando refs existem (CR12-D7)', () => {
    const hash = 'sha256-test-cr12-d7';
    drizzle
      .insert(attachments)
      .values({
        hash,
        size: 100,
        mimeType: 'text/plain',
        refCount: 1,
        createdAt: NOW,
        lastAccessedAt: NOW,
      })
      .run();
    drizzle
      .insert(attachmentRefs)
      .values({
        id: 'ref-cr12-d7',
        hash,
        sessionId,
        originalName: 'test.txt',
        createdAt: NOW,
      })
      .run();

    expect(() => drizzle.delete(attachments).where(eq(attachments.hash, hash)).run()).toThrow(
      /FOREIGN KEY constraint/,
    );

    // Após remover o ref, delete passa.
    drizzle.delete(attachmentRefs).where(eq(attachmentRefs.id, 'ref-cr12-d7')).run();
    drizzle.delete(attachments).where(eq(attachments.hash, hash)).run();
    const blob = drizzle.select().from(attachments).where(eq(attachments.hash, hash)).all();
    expect(blob).toHaveLength(0);
  });
});
