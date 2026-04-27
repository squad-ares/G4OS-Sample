import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Message, SessionEvent } from '@g4os/kernel/schemas';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  applyEvent,
  catchUp,
  rebuildProjection,
  SessionEventStore,
  truncateProjection,
} from '../events/index.ts';
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

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

describe('SessionEventStore', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-events-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('append writes a JSONL line per event', async () => {
    const store = new SessionEventStore('ws-1', { workspaceRoot: tmpDir });
    const sessionId = randomUUID();
    await store.append(sessionId, makeSessionCreated(sessionId));
    await store.append(sessionId, makeMessageAdded(sessionId, 1));

    const events: SessionEvent[] = [];
    for await (const e of store.read(sessionId)) events.push(e);
    expect(events).toHaveLength(2);
    expect(events[0]?.type).toBe('session.created');
    expect(events[1]?.type).toBe('message.added');
  });

  it('read on non-existent session returns empty', async () => {
    const store = new SessionEventStore('ws-1', { workspaceRoot: tmpDir });
    const events: SessionEvent[] = [];
    for await (const e of store.read(randomUUID())) events.push(e);
    expect(events).toEqual([]);
  });

  it('readAfter filters by sequenceNumber', async () => {
    const store = new SessionEventStore('ws-1', { workspaceRoot: tmpDir });
    const sessionId = randomUUID();
    await store.append(sessionId, makeSessionCreated(sessionId, 0));
    await store.append(sessionId, makeMessageAdded(sessionId, 1));
    await store.append(sessionId, makeMessageAdded(sessionId, 2));

    const after1 = await store.readAfter(sessionId, 1);
    expect(after1).toHaveLength(1);
    expect(after1[0]?.sequenceNumber).toBe(2);
  });

  it('rejects invalid event on append (Zod validation)', async () => {
    const store = new SessionEventStore('ws-1', { workspaceRoot: tmpDir });
    const sessionId = randomUUID();
    const bad = { type: 'message.added', sessionId, sequenceNumber: -1 } as unknown as SessionEvent;
    await expect(store.append(sessionId, bad)).rejects.toThrow();
  });

  it('throws on corrupted JSON line during read', async () => {
    const store = new SessionEventStore('ws-1', { workspaceRoot: tmpDir });
    const sessionId = randomUUID();
    await store.append(sessionId, makeSessionCreated(sessionId, 0));
    // Corrompe manualmente
    await writeFile(store.path(sessionId), 'not-json\n', { flag: 'a' });

    await expect(async () => {
      for await (const _ of store.read(sessionId));
    }).rejects.toThrow();
  });

  it('truncateAfter removes events beyond the given sequence', async () => {
    const store = new SessionEventStore('ws-1', { workspaceRoot: tmpDir });
    const sessionId = randomUUID();
    await store.append(sessionId, makeSessionCreated(sessionId, 0));
    await store.append(sessionId, makeMessageAdded(sessionId, 1, 'keep'));
    await store.append(sessionId, makeMessageAdded(sessionId, 2, 'drop-a'));
    await store.append(sessionId, makeMessageAdded(sessionId, 3, 'drop-b'));

    const removed = await store.truncateAfter(sessionId, 1);
    expect(removed).toBe(2);

    const remaining: SessionEvent[] = [];
    for await (const e of store.read(sessionId)) remaining.push(e);
    expect(remaining).toHaveLength(2);
    expect(remaining.map((e) => e.sequenceNumber)).toEqual([0, 1]);
  });

  it('truncateAfter is a no-op when nothing to remove', async () => {
    const store = new SessionEventStore('ws-1', { workspaceRoot: tmpDir });
    const sessionId = randomUUID();
    await store.append(sessionId, makeSessionCreated(sessionId, 0));
    await store.append(sessionId, makeMessageAdded(sessionId, 1));

    const removed = await store.truncateAfter(sessionId, 5);
    expect(removed).toBe(0);
    expect(await store.count(sessionId)).toBe(2);
  });

  it('truncateAfter(-1) removes all events and deletes file', async () => {
    const store = new SessionEventStore('ws-1', { workspaceRoot: tmpDir });
    const sessionId = randomUUID();
    await store.append(sessionId, makeSessionCreated(sessionId, 0));
    await store.append(sessionId, makeMessageAdded(sessionId, 1));

    const removed = await store.truncateAfter(sessionId, -1);
    expect(removed).toBe(2);
    expect(await store.count(sessionId)).toBe(0);
  });

  it('truncateAfter on non-existent session returns 0', async () => {
    const store = new SessionEventStore('ws-1', { workspaceRoot: tmpDir });
    expect(await store.truncateAfter(randomUUID(), 10)).toBe(0);
  });

  it('append of 1000 events completes under 30s', async () => {
    // Windows filesystem tem overhead significativamente maior que POSIX em
    // writes sequenciais; margem de 30s cobre runners GitHub com folga.
    const store = new SessionEventStore('ws-1', { workspaceRoot: tmpDir });
    const sessionId = randomUUID();
    await store.append(sessionId, makeSessionCreated(sessionId, 0));

    const start = Date.now();
    for (let i = 1; i <= 1000; i += 1) {
      await store.append(sessionId, makeMessageAdded(sessionId, i));
    }
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(30000);
  }, 45000);
});

describe('reducer applyEvent', () => {
  let db: Db;
  let drizzle: AppDb;
  let tmpDir: string;
  const workspaceId = randomUUID();
  const sessionId = randomUUID();

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-reducer-'));
    db = new Db();
    await db.open({ filename: join(tmpDir, 'app.db') });
    drizzle = createDrizzle(db);
    runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });

    drizzle
      .insert(workspaces)
      .values({
        id: workspaceId,
        name: 'Test',
        slug: `test-${Date.now()}`,
        rootPath: tmpDir,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();
  });

  afterEach(async () => {
    db.dispose();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('session.created inserts row with status=active', () => {
    applyEvent(drizzle, makeSessionCreated(sessionId, 0, workspaceId));
    const row = drizzle.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row?.status).toBe('active');
    expect(row?.lastEventSequence).toBe(0);
  });

  it('message.added inserts index row + increments messageCount', () => {
    applyEvent(drizzle, makeSessionCreated(sessionId, 0, workspaceId));
    applyEvent(drizzle, makeMessageAdded(sessionId, 1, 'Hello world'));
    applyEvent(drizzle, makeMessageAdded(sessionId, 2, 'Second'));

    const session = drizzle.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(session?.messageCount).toBe(2);
    expect(session?.lastEventSequence).toBe(2);

    const msgs = drizzle
      .select()
      .from(messagesIndex)
      .where(eq(messagesIndex.sessionId, sessionId))
      .all();
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.contentPreview).toBe('Hello world');
  });

  it('session.renamed updates name + cursor', () => {
    applyEvent(drizzle, makeSessionCreated(sessionId, 0, workspaceId));
    applyEvent(drizzle, {
      type: 'session.renamed',
      eventId: randomUUID(),
      sessionId,
      sequenceNumber: 1,
      timestamp: Date.now(),
      newName: 'Renamed',
    });
    const row = drizzle.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row?.name).toBe('Renamed');
  });

  it('session.archived updates status to archived', () => {
    applyEvent(drizzle, makeSessionCreated(sessionId, 0, workspaceId));
    applyEvent(drizzle, {
      type: 'session.archived',
      eventId: randomUUID(),
      sessionId,
      sequenceNumber: 1,
      timestamp: Date.now(),
    });
    const row = drizzle.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row?.status).toBe('archived');
  });

  it('writes checkpoint after each event', () => {
    applyEvent(drizzle, makeSessionCreated(sessionId, 0, workspaceId));
    applyEvent(drizzle, makeMessageAdded(sessionId, 1));

    const cp = drizzle
      .select()
      .from(eventCheckpoints)
      .where(eq(eventCheckpoints.sessionId, sessionId))
      .get();
    expect(cp?.lastSequence).toBe(1);
    expect(cp?.consumerName).toBe('messages-index');
  });
});

describe('replay rebuildProjection + catchUp', () => {
  let db: Db;
  let drizzle: AppDb;
  let tmpDir: string;
  const workspaceId = randomUUID();
  const sessionId = randomUUID();
  let store: SessionEventStore;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-replay-'));
    db = new Db();
    await db.open({ filename: join(tmpDir, 'app.db') });
    drizzle = createDrizzle(db);
    runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });
    drizzle
      .insert(workspaces)
      .values({
        id: workspaceId,
        name: 'Test',
        slug: `test-${Date.now()}`,
        rootPath: tmpDir,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    store = new SessionEventStore(workspaceId, { workspaceRoot: tmpDir });
    await store.append(sessionId, makeSessionCreated(sessionId, 0, workspaceId));
    await store.append(sessionId, makeMessageAdded(sessionId, 1, 'one'));
    await store.append(sessionId, makeMessageAdded(sessionId, 2, 'two'));
  });

  afterEach(async () => {
    db.dispose();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('rebuildProjection applies all events', async () => {
    const applied = await rebuildProjection(drizzle, store, sessionId);
    expect(applied).toBe(3);
    const session = drizzle.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(session?.messageCount).toBe(2);
    expect(session?.lastEventSequence).toBe(2);
  });

  it('rebuildProjection is idempotent', async () => {
    await rebuildProjection(drizzle, store, sessionId);
    await rebuildProjection(drizzle, store, sessionId);
    const msgs = drizzle
      .select()
      .from(messagesIndex)
      .where(eq(messagesIndex.sessionId, sessionId))
      .all();
    expect(msgs).toHaveLength(2);
  });

  it('catchUp applies only events after checkpoint', async () => {
    // Primeiro aplicamos até seq=1 via full apply direto
    applyEvent(drizzle, makeSessionCreated(sessionId, 0, workspaceId));
    applyEvent(drizzle, makeMessageAdded(sessionId, 1, 'one'));
    // agora existe checkpoint em 1

    const applied = await catchUp(drizzle, store, sessionId);
    expect(applied).toBe(1); // só o evento de seq=2
    const session = drizzle.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(session?.messageCount).toBe(2);
  });

  it('catchUp without checkpoint applies all events', async () => {
    const applied = await catchUp(drizzle, store, sessionId);
    expect(applied).toBe(3);
  });
});

function makeSessionCreated(
  sessionId: string,
  seq = 0,
  workspaceId: string = randomUUID(),
): SessionEvent {
  return {
    type: 'session.created',
    eventId: randomUUID(),
    sessionId,
    sequenceNumber: seq,
    timestamp: Date.now(),
    workspaceId,
    name: 'Test Session',
    createdBy: 'user@test.local',
  };
}

function makeMessageAdded(sessionId: string, seq: number, text = 'msg'): SessionEvent {
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

describe('truncateProjection', () => {
  let db: Db;
  let drizzle: AppDb;
  let tmpDir: string;
  const workspaceId = randomUUID();
  const sessionId = randomUUID();

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-truncate-'));
    db = new Db();
    await db.open({ filename: join(tmpDir, 'app.db') });
    drizzle = createDrizzle(db);
    runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });
    drizzle
      .insert(workspaces)
      .values({
        id: workspaceId,
        name: 'Test',
        slug: `test-${Date.now()}`,
        rootPath: tmpDir,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    // Seed projection: session + 3 messages at seq 0-3
    applyEvent(drizzle, makeSessionCreated(sessionId, 0, workspaceId));
    applyEvent(drizzle, makeMessageAdded(sessionId, 1, 'alpha'));
    applyEvent(drizzle, makeMessageAdded(sessionId, 2, 'beta'));
    applyEvent(drizzle, makeMessageAdded(sessionId, 3, 'gamma'));
  });

  afterEach(async () => {
    db.dispose();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('removes messages_index rows beyond cutoff', () => {
    truncateProjection(drizzle, sessionId, 1);

    const msgs = drizzle
      .select()
      .from(messagesIndex)
      .where(eq(messagesIndex.sessionId, sessionId))
      .all();
    expect(msgs).toHaveLength(1);
    expect(msgs[0]?.contentPreview).toBe('alpha');
  });

  it('updates sessions.lastEventSequence and messageCount', () => {
    truncateProjection(drizzle, sessionId, 1);

    const row = drizzle.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row?.lastEventSequence).toBe(1);
    expect(row?.messageCount).toBe(1);
  });

  it('resets checkpoint to the cutoff sequence', () => {
    truncateProjection(drizzle, sessionId, 1);

    const cp = drizzle
      .select()
      .from(eventCheckpoints)
      .where(eq(eventCheckpoints.sessionId, sessionId))
      .get();
    expect(cp?.lastSequence).toBe(1);
  });

  it('truncating at current tail is a no-op on rows', () => {
    truncateProjection(drizzle, sessionId, 3);

    const msgs = drizzle
      .select()
      .from(messagesIndex)
      .where(eq(messagesIndex.sessionId, sessionId))
      .all();
    expect(msgs).toHaveLength(3);

    const row = drizzle.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row?.messageCount).toBe(3);
    expect(row?.lastEventSequence).toBe(3);
  });

  it('truncating at -1 removes all messages_index rows and sets messageCount to 0', () => {
    truncateProjection(drizzle, sessionId, -1);

    const msgs = drizzle
      .select()
      .from(messagesIndex)
      .where(eq(messagesIndex.sessionId, sessionId))
      .all();
    expect(msgs).toHaveLength(0);

    const row = drizzle.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    expect(row?.messageCount).toBe(0);
    expect(row?.lastEventSequence).toBe(0);
  });

  it('creates checkpoint row if none existed before', () => {
    // Remove existing checkpoint to simulate fresh state
    drizzle.delete(eventCheckpoints).where(eq(eventCheckpoints.sessionId, sessionId)).run();

    truncateProjection(drizzle, sessionId, 2);

    const cp = drizzle
      .select()
      .from(eventCheckpoints)
      .where(eq(eventCheckpoints.sessionId, sessionId))
      .get();
    expect(cp?.lastSequence).toBe(2);
    expect(cp?.consumerName).toBe('messages-index');
  });
});
