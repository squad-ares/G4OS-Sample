import { copyFile, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDrizzle, Db } from '../index.ts';
import { backupBeforeMigration, getAppliedMigrations, runMigrations } from '../migrations/index.ts';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

describe('migrations runner', () => {
  let db: Db;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-migrations-'));
    db = new Db();
    await db.open({ filename: join(tmpDir, 'app.db') });
  });

  afterEach(async () => {
    db.dispose();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('applies baseline migration on empty database', () => {
    const drizzle = createDrizzle(db);
    runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });

    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);

    expect(names).toContain('workspaces');
    expect(names).toContain('sessions');
    expect(names).toContain('messages_index');
    expect(names).toContain('event_checkpoints');
    expect(names).toContain('__drizzle_migrations');
  });

  it('creates FTS5 virtual table + triggers from baseline', () => {
    const drizzle = createDrizzle(db);
    runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });

    const fts = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='messages_fts'`)
      .get() as { name: string } | undefined;
    expect(fts?.name).toBe('messages_fts');

    const triggers = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name`)
      .all() as Array<{ name: string }>;
    const names = triggers.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining(['messages_fts_ai', 'messages_fts_ad', 'messages_fts_au']),
    );
  });

  it('is idempotent on re-run', () => {
    const drizzle = createDrizzle(db);
    runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });
    const firstRun = getAppliedMigrations(drizzle);
    expect(firstRun.length).toBeGreaterThanOrEqual(1);

    // Re-run: não deve falhar e não deve duplicar linhas
    runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });
    const secondRun = getAppliedMigrations(drizzle);
    expect(secondRun).toHaveLength(firstRun.length);
    expect(secondRun.map((r) => r.hash)).toEqual(firstRun.map((r) => r.hash));
  });

  it('registers baseline in __drizzle_migrations with stable hash', () => {
    const drizzle = createDrizzle(db);
    runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });

    const applied = getAppliedMigrations(drizzle);
    expect(applied.length).toBeGreaterThanOrEqual(1);
    const baseline = applied[0];
    expect(baseline?.name).toMatch(/^\d{14}_/);
    expect(baseline?.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(baseline?.appliedAt).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('fails cleanly when migrations folder is invalid', () => {
    const drizzle = createDrizzle(db);
    expect(() =>
      runMigrations(drizzle, { migrationsFolder: join(tmpDir, 'nonexistent') }),
    ).toThrow();
  });
});

describe('backupBeforeMigration', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-backup-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns null when source DB does not exist', async () => {
    const result = await backupBeforeMigration({
      source: join(tmpDir, 'missing.db'),
    });
    expect(result).toBeNull();
  });

  it('creates backup copy when source exists', async () => {
    const source = join(tmpDir, 'app.db');
    await writeFile(source, 'fake-sqlite-bytes');
    const target = join(tmpDir, 'manual-backup.db');

    const result = await backupBeforeMigration({ source, target });
    expect(result).toBe(target);
    const info = await stat(target);
    expect(info.size).toBe('fake-sqlite-bytes'.length);
  });

  it('generates default target with timestamp suffix', async () => {
    const source = join(tmpDir, 'app.db');
    await copyFile('/dev/null', source).catch(async () => {
      await writeFile(source, '');
    });
    await writeFile(source, 'bytes');

    const result = await backupBeforeMigration({ source });
    expect(result).not.toBeNull();
    if (result) {
      expect(basename(result)).toMatch(/^app\.db\.backup-\d+$/);
      await stat(result);
    }
  });

  it('preserves source intact after backup', async () => {
    const source = join(tmpDir, 'app.db');
    await writeFile(source, 'original-content');

    await backupBeforeMigration({ source });
    const after = await stat(source);
    expect(after.size).toBe('original-content'.length);
  });
});

describe('migrations startup flow', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-startup-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('full flow: backup returns null on first boot, then migrates', async () => {
    const dbPath = join(tmpDir, 'app.db');
    const backupPath = await backupBeforeMigration({ source: dbPath });
    expect(backupPath).toBeNull();

    const db = new Db();
    await db.open({ filename: dbPath });
    try {
      const drizzle = createDrizzle(db);
      runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });
      const applied = getAppliedMigrations(drizzle);
      expect(applied.length).toBeGreaterThanOrEqual(1);
    } finally {
      db.dispose();
    }
  });

  it('full flow: backup is created on second boot', async () => {
    const dbPath = join(tmpDir, 'app.db');
    {
      const db = new Db();
      await db.open({ filename: dbPath });
      const drizzle = createDrizzle(db);
      runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });
      db.dispose();
    }

    const backupPath = await backupBeforeMigration({ source: dbPath });
    expect(backupPath).not.toBeNull();
    if (backupPath) {
      const info = await stat(backupPath);
      expect(info.size).toBeGreaterThan(0);
      // Saneamento: backup está no mesmo diretório do source.
      expect(dirname(backupPath)).toBe(tmpDir);
    }
  });
});
