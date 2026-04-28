import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AttachmentGateway, AttachmentStorage } from '../attachments/index.ts';
import { type AppDb, createDrizzle, Db, runMigrations } from '../index.ts';
import { attachmentRefs, attachments } from '../schema/attachments.ts';
import { sessions } from '../schema/sessions.ts';
import { workspaces } from '../schema/workspaces.ts';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

describe('AttachmentStorage', () => {
  let tmpDir: string;
  let storage: AttachmentStorage;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-attach-storage-'));
    storage = new AttachmentStorage({ baseDir: tmpDir });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('store writes content and returns SHA-256 hash', async () => {
    const content = Buffer.from('hello world');
    const result = await storage.store(content);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.size).toBe(11);
    expect(await storage.exists(result.hash)).toBe(true);
  });

  it('path uses 2-char prefix directory', async () => {
    const content = Buffer.from('abc');
    const { hash } = await storage.store(content);
    const path = storage.path(hash);
    expect(path).toContain(join(tmpDir, hash.slice(0, 2), hash.slice(2)));
  });

  it('store is idempotent — same content writes 1 file', async () => {
    const content = Buffer.from('dedup me');
    const a = await storage.store(content);
    const b = await storage.store(content);
    expect(a.hash).toBe(b.hash);

    const prefix = a.hash.slice(0, 2);
    const files = await readdir(join(tmpDir, prefix));
    expect(files).toHaveLength(1);
  });

  it('read returns stored content', async () => {
    const content = Buffer.from('the content');
    const { hash } = await storage.store(content);
    const read = await storage.read(hash);
    expect(read.equals(content)).toBe(true);
  });

  it('delete removes file; delete on missing is no-op', async () => {
    const content = Buffer.from('ephemeral');
    const { hash } = await storage.store(content);
    await storage.delete(hash);
    expect(await storage.exists(hash)).toBe(false);
    await expect(storage.delete(hash)).resolves.toBeUndefined();
  });
});

describe('AttachmentGateway', () => {
  let db: Db;
  let drizzle: AppDb;
  let storage: AttachmentStorage;
  let gateway: AttachmentGateway;
  let tmpDir: string;
  const sessionId = randomUUID();

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-attach-gw-'));
    db = new Db();
    await db.open({ filename: join(tmpDir, 'app.db') });
    drizzle = createDrizzle(db);
    runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });
    storage = new AttachmentStorage({ baseDir: join(tmpDir, 'blobs') });
    gateway = new AttachmentGateway(drizzle, storage);
    // CR6-02: attachment_refs.session_id agora é FK pra sessions.id, então
    // precisamos seedar workspace + sessão antes do gateway.attach.
    const wsId = 'ws-attach-test';
    const now = Date.now();
    drizzle
      .insert(workspaces)
      .values({
        id: wsId,
        name: 'attach-test',
        slug: 'attach-test',
        rootPath: join(tmpDir, 'ws'),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    drizzle
      .insert(sessions)
      .values({
        id: sessionId,
        workspaceId: wsId,
        name: 'attach-test-session',
        status: 'active',
        messageCount: 0,
        lastEventSequence: 0,
        createdAt: now,
        updatedAt: now,
        enabledSourceSlugsJson: '[]',
        stickyMountedSourceSlugsJson: '[]',
        rejectedSourceSlugsJson: '[]',
      })
      .run();
  });

  afterEach(async () => {
    db.dispose();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('attach stores blob + inserts attachments row + ref row', async () => {
    const result = await gateway.attach({
      content: Buffer.from('hi'),
      mimeType: 'text/plain',
      originalName: 'hi.txt',
      sessionId,
    });
    expect(result.refId).toMatch(/^[0-9a-f-]{36}$/);

    const a = drizzle.select().from(attachments).where(eq(attachments.hash, result.hash)).get();
    expect(a?.refCount).toBe(1);
    expect(a?.mimeType).toBe('text/plain');

    const refs = drizzle
      .select()
      .from(attachmentRefs)
      .where(eq(attachmentRefs.hash, result.hash))
      .all();
    expect(refs).toHaveLength(1);
  });

  it('attach same content 10x creates 1 file + refCount=10', async () => {
    const content = Buffer.from('duplicate me');
    let hash = '';
    for (let i = 0; i < 10; i += 1) {
      const res = await gateway.attach({
        content,
        mimeType: 'text/plain',
        originalName: 'x.txt',
        sessionId,
      });
      hash = res.hash;
    }
    const row = drizzle.select().from(attachments).where(eq(attachments.hash, hash)).get();
    expect(row?.refCount).toBe(10);

    const prefix = hash.slice(0, 2);
    const files = await readdir(join(tmpDir, 'blobs', prefix));
    expect(files).toHaveLength(1);
  });

  it('detach decrements refCount; keeps file until refCount=0', async () => {
    const content = Buffer.from('shared');
    const a = await gateway.attach({
      content,
      mimeType: 'text/plain',
      originalName: 'a.txt',
      sessionId,
    });
    const b = await gateway.attach({
      content,
      mimeType: 'text/plain',
      originalName: 'b.txt',
      sessionId,
    });
    expect(a.hash).toBe(b.hash);

    await gateway.detach(a.refId);
    const mid = drizzle.select().from(attachments).where(eq(attachments.hash, a.hash)).get();
    expect(mid?.refCount).toBe(1);
    expect(await storage.exists(a.hash)).toBe(true);

    await gateway.detach(b.refId);
    const gone = drizzle.select().from(attachments).where(eq(attachments.hash, a.hash)).get();
    expect(gone).toBeUndefined();
    expect(await storage.exists(a.hash)).toBe(false);
  });

  it('detach of unknown ref is a no-op', async () => {
    await expect(gateway.detach(randomUUID())).resolves.toBeUndefined();
  });

  it('gc removes orphan blobs older than ttl', async () => {
    const content = Buffer.from('orphan');
    const { hash, refId } = await gateway.attach({
      content,
      mimeType: 'text/plain',
      originalName: 'o.txt',
      sessionId,
    });
    await gateway.detach(refId); // removes immediately because refCount=0

    // Re-inserta manualmente um órfão antigo para testar gc
    const oldHash = 'a'.repeat(64);
    drizzle
      .insert(attachments)
      .values({
        hash: oldHash,
        size: 0,
        mimeType: 'text/plain',
        refCount: 0,
        createdAt: 0,
        lastAccessedAt: 0,
      })
      .run();

    const removed = await gateway.gc(1000);
    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await storage.exists(hash)).toBe(false); // já removido pelo detach
  });

  it('listReferencedHashesForSessions returns unique hashes', async () => {
    const c1 = Buffer.from('one');
    const c2 = Buffer.from('two');
    await gateway.attach({ content: c1, mimeType: 'text/plain', originalName: 'a', sessionId });
    await gateway.attach({ content: c1, mimeType: 'text/plain', originalName: 'b', sessionId });
    await gateway.attach({ content: c2, mimeType: 'text/plain', originalName: 'c', sessionId });

    const hashes = gateway.listReferencedHashesForSessions([sessionId]);
    expect(hashes).toHaveLength(2);
  });
});
