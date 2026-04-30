/**
 * CR12-D4: garante que UNIQUE constraint em (workspaceId, slug) bloqueia
 * dois projects com mesmo slug no mesmo workspace, mas permite slug
 * idêntico em workspaces distintos. Service-side faz pré-check via
 * `findBySlug` para mapear ao código de erro `PROJECT_SLUG_CONFLICT`;
 * este teste cobre o gate final no DB.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type AppDb, createDrizzle, Db, runMigrations, workspaces } from '../index.ts';
import { ProjectsRepository } from '../projects/repository.ts';
import { projects } from '../schema/projects.ts';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));
const NOW = 1_700_000_000_000;

describe('projects slug uniqueness', () => {
  let db: Db;
  let drizzle: AppDb;
  let repo: ProjectsRepository;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-projslug-'));
    db = new Db();
    await db.open({ filename: join(tmpDir, 'app.db') });
    drizzle = createDrizzle(db);
    runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });
    repo = new ProjectsRepository(drizzle);

    drizzle
      .insert(workspaces)
      .values([
        { id: 'ws-a', name: 'A', slug: 'ws-a', rootPath: '/tmp/a', createdAt: NOW, updatedAt: NOW },
        { id: 'ws-b', name: 'B', slug: 'ws-b', rootPath: '/tmp/b', createdAt: NOW, updatedAt: NOW },
      ])
      .run();
  });

  afterEach(async () => {
    db.dispose();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('bloqueia segundo project com mesmo (workspaceId, slug)', () => {
    drizzle
      .insert(projects)
      .values({
        id: 'p1',
        workspaceId: 'ws-a',
        name: 'Foo',
        slug: 'foo',
        rootPath: '/tmp/a/p1',
        status: 'active',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();

    expect(() =>
      drizzle
        .insert(projects)
        .values({
          id: 'p2',
          workspaceId: 'ws-a',
          name: 'Foo bis',
          slug: 'foo',
          rootPath: '/tmp/a/p2',
          status: 'active',
          createdAt: NOW,
          updatedAt: NOW,
        })
        .run(),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('permite mesmo slug em workspaces distintos', () => {
    drizzle
      .insert(projects)
      .values([
        {
          id: 'p1',
          workspaceId: 'ws-a',
          name: 'Foo',
          slug: 'foo',
          rootPath: '/tmp/a/p1',
          status: 'active',
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: 'p2',
          workspaceId: 'ws-b',
          name: 'Foo',
          slug: 'foo',
          rootPath: '/tmp/b/p2',
          status: 'active',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ])
      .run();

    const all = drizzle.select().from(projects).all();
    expect(all).toHaveLength(2);
  });

  it('findBySlug retorna o id do project conflitante', async () => {
    drizzle
      .insert(projects)
      .values({
        id: 'p1',
        workspaceId: 'ws-a',
        name: 'Foo',
        slug: 'foo',
        rootPath: '/tmp/a/p1',
        status: 'active',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();

    const found = await repo.findBySlug('ws-a' as never, 'foo');
    expect(found).toBe('p1');

    const missing = await repo.findBySlug('ws-a' as never, 'nope');
    expect(missing).toBeNull();

    // Mesmo slug em workspace distinto não conflita.
    const otherWs = await repo.findBySlug('ws-b' as never, 'foo');
    expect(otherWs).toBeNull();
  });
});
