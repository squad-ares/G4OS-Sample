import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Message, SessionEvent } from '@g4os/kernel/schemas';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyEvent, catchUp, rebuildProjection, SessionEventStore } from '../events/index.ts';
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

  it('append of 1000 events completes under 10s', async () => {
    const store = new SessionEventStore('ws-1', { workspaceRoot: tmpDir });
    const sessionId = randomUUID();
    await store.append(sessionId, makeSessionCreated(sessionId, 0));

    const start = Date.now();
    for (let i = 1; i <= 1000; i += 1) {
      await store.append(sessionId, makeMessageAdded(sessionId, i));
    }
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(10000);
  }, 10000);
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
