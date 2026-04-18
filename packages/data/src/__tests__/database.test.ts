import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Db, SqliteClosedError } from '../sqlite/index.ts';

describe('Db (node:sqlite)', () => {
  let db: Db;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-sqlite-'));
    db = new Db();
    await db.open({ filename: join(tmpDir, 'test.db') });
  });

  afterEach(async () => {
    db.dispose();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('opens in WAL mode by default', () => {
    const mode = db.pragma('journal_mode');
    expect(String(mode).toLowerCase()).toBe('wal');
  });

  it('enforces foreign keys', () => {
    const fk = db.pragma('foreign_keys');
    expect(Number(fk)).toBe(1);
  });

  it('uses synchronous=NORMAL by default', () => {
    const sync = db.pragma('synchronous');
    expect(Number(sync)).toBe(1);
  });

  it('supports prepare + run + get roundtrip', () => {
    db.exec('CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    const insert = db.prepare('INSERT INTO kv (k, v) VALUES (?, ?)');
    const result = insert.run('hello', 'world');
    expect(result.changes).toBe(1);

    const select = db.prepare('SELECT k, v FROM kv WHERE k = ?');
    const row = select.get('hello');
    expect(row).toEqual({ k: 'hello', v: 'world' });
  });

  it('transaction commits atomically', () => {
    db.exec('CREATE TABLE t (n INTEGER NOT NULL)');
    const insert = db.prepare('INSERT INTO t (n) VALUES (?)');
    db.transaction(() => {
      for (const x of [1, 2, 3]) insert.run(x);
    });

    const rows = db.prepare('SELECT n FROM t ORDER BY n').all() as Array<{ n: number }>;
    expect(rows.map((r) => r.n)).toEqual([1, 2, 3]);
  });

  it('transaction rolls back on throw', () => {
    db.exec('CREATE TABLE t (n INTEGER NOT NULL UNIQUE)');
    const insert = db.prepare('INSERT INTO t (n) VALUES (?)');

    expect(() =>
      db.transaction(() => {
        for (const x of [1, 2, 2]) insert.run(x);
      }),
    ).toThrow();

    const rows = db.prepare('SELECT n FROM t').all();
    expect(rows).toEqual([]);
  });

  it('throws SqliteClosedError after dispose', () => {
    db.dispose();
    expect(() => db.prepare('SELECT 1')).toThrow(SqliteClosedError);
  });
});

describe('Db (in-memory)', () => {
  it('opens :memory: database', async () => {
    const db = new Db();
    try {
      await db.open({ inMemory: true });
      expect(db.filename).toBe(':memory:');
      db.exec('CREATE TABLE t (v INTEGER)');
      db.prepare('INSERT INTO t (v) VALUES (?)').run(42);
      const row = db.prepare('SELECT v FROM t').get() as { v: number } | undefined;
      expect(row?.v).toBe(42);
    } finally {
      db.dispose();
    }
  });
});
