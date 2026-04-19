import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Message, SessionEvent } from '@g4os/kernel/schemas';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AttachmentGateway, AttachmentStorage } from '../attachments/index.ts';
import {
  BACKUP_MANIFEST_VERSION,
  exportWorkspaceBackup,
  restoreWorkspaceBackup,
} from '../backup/index.ts';
import { applyEvent, SessionEventStore } from '../events/index.ts';
import { type AppDb, createDrizzle, Db, runMigrations } from '../index.ts';
import { messagesIndex } from '../schema/messages-index.ts';
import { sessions } from '../schema/sessions.ts';
import { workspaces } from '../schema/workspaces.ts';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

describe('backup export/import', () => {
  let db: Db;
  let drizzle: AppDb;
  let storage: AttachmentStorage;
  let gateway: AttachmentGateway;
  let tmpDir: string;
  let workspaceRoot: string;
  const workspaceId = randomUUID();
  const sessionId = randomUUID();

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-backup-'));
    workspaceRoot = join(tmpDir, 'ws');
    db = new Db();
    await db.open({ filename: join(tmpDir, 'app.db') });
    drizzle = createDrizzle(db);
    runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });
    storage = new AttachmentStorage({ baseDir: join(tmpDir, 'blobs') });
    gateway = new AttachmentGateway(drizzle, storage);

    drizzle
      .insert(workspaces)
      .values({
        id: workspaceId,
        name: 'Backup Test',
        slug: `wb-${Date.now()}`,
        rootPath: workspaceRoot,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    const store = new SessionEventStore(workspaceId, { workspaceRoot });
    const created = makeSessionCreated(sessionId, 0, workspaceId);
    await store.append(sessionId, created);
    applyEvent(drizzle, created);

    const added = makeMessageAdded(sessionId, 1, 'hello backup');
    await store.append(sessionId, added);
    applyEvent(drizzle, added);

    await gateway.attach({
      content: Buffer.from('file-a'),
      mimeType: 'text/plain',
      originalName: 'a.txt',
      sessionId,
    });
    await gateway.attach({
      content: Buffer.from('file-b'),
      mimeType: 'text/plain',
      originalName: 'b.txt',
      sessionId,
    });
  });

  afterEach(async () => {
    db.dispose();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('export produces a non-empty ZIP with correct counts', async () => {
    const outputPath = join(tmpDir, 'backup.zip');
    const result = await exportWorkspaceBackup({
      workspaceId,
      db: drizzle,
      storage,
      gateway,
      workspaceRoot,
      outputPath,
    });

    expect(result.manifestVersion).toBe(BACKUP_MANIFEST_VERSION);
    expect(result.sessionsCount).toBe(1);
    expect(result.attachmentsCount).toBe(2);
    const zipStat = await stat(outputPath);
    expect(zipStat.size).toBeGreaterThan(0);
  });

  it('restore into fresh workspace reconstructs projection identical to source', async () => {
    const outputPath = join(tmpDir, 'backup.zip');
    await exportWorkspaceBackup({
      workspaceId,
      db: drizzle,
      storage,
      gateway,
      workspaceRoot,
      outputPath,
    });

    // Fresh target db + storage
    const targetDir = await mkdtemp(join(tmpdir(), 'g4os-backup-target-'));
    const targetDb = new Db();
    await targetDb.open({ filename: join(targetDir, 'app.db') });
    const targetDrizzle = createDrizzle(targetDb);
    runMigrations(targetDrizzle, { migrationsFolder: MIGRATIONS_FOLDER });
    const targetStorage = new AttachmentStorage({ baseDir: join(targetDir, 'blobs') });

    // Workspace row must pre-exist (FK); backup não restaura workspaces.
    targetDrizzle
      .insert(workspaces)
      .values({
        id: workspaceId,
        name: 'Backup Test',
        slug: `wb-${Date.now()}-r`,
        rootPath: join(targetDir, 'ws'),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    const result = await restoreWorkspaceBackup({
      backupPath: outputPath,
      db: targetDrizzle,
      storage: targetStorage,
      workspaceRoot: join(targetDir, 'ws'),
    });

    expect(result.sessionsImported).toBe(1);
    expect(result.attachmentsImported).toBe(2);

    const session = targetDrizzle.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(session?.messageCount).toBe(1);

    const msgs = targetDrizzle
      .select()
      .from(messagesIndex)
      .where(eq(messagesIndex.sessionId, sessionId))
      .all();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.contentPreview).toBe('hello backup');

    targetDb.dispose();
    await rm(targetDir, { recursive: true, force: true });
  });

  it('restore rejects unknown manifest version', async () => {
    const outputPath = join(tmpDir, 'bad.zip');
    const { default: archiver } = await import('archiver');
    const { createWriteStream } = await import('node:fs');
    await new Promise<void>((resolve, reject) => {
      const a = archiver('zip');
      const out = createWriteStream(outputPath);
      out.on('close', () => resolve());
      out.on('error', reject);
      a.on('error', reject);
      a.pipe(out);
      a.append(JSON.stringify({ version: 999 }), { name: 'manifest.json' });
      a.finalize().catch(reject);
    });

    await expect(
      restoreWorkspaceBackup({
        backupPath: outputPath,
        db: drizzle,
        storage,
        workspaceRoot,
      }),
    ).rejects.toThrow(/Invalid backup manifest/);
  });

  it('failIfExists=true rejects when workspace already exists', async () => {
    const outputPath = join(tmpDir, 'b.zip');
    await exportWorkspaceBackup({
      workspaceId,
      db: drizzle,
      storage,
      gateway,
      workspaceRoot,
      outputPath,
    });

    await expect(
      restoreWorkspaceBackup({
        backupPath: outputPath,
        db: drizzle,
        storage,
        workspaceRoot,
        failIfExists: true,
      }),
    ).rejects.toThrow(/already exists/);
  });
});

function makeSessionCreated(sessionId: string, seq: number, workspaceId: string): SessionEvent {
  return {
    type: 'session.created',
    eventId: randomUUID(),
    sessionId,
    sequenceNumber: seq,
    timestamp: Date.now(),
    workspaceId,
    name: 'Backup Session',
    createdBy: 'user@test.local',
  };
}

function makeMessageAdded(sessionId: string, seq: number, text: string): SessionEvent {
  const message: Message = {
    id: randomUUID(),
    sessionId,
    role: 'user',
    content: [{ type: 'text', text }],
    attachments: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {},
  };
  return {
    type: 'message.added',
    eventId: randomUUID(),
    sessionId,
    sequenceNumber: seq,
    timestamp: Date.now(),
    message,
  };
}
