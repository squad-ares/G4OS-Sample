/**
 * CR12-D6: reparent atômico.
 *
 * Antes: rename + N updates de descendentes corriam em writes independentes
 * — falha no meio deixava árvore inconsistente (parent novo, descendentes
 * com treeCode antigo). Agora tudo dentro de `db.transaction`.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { LabelId } from '@g4os/kernel/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type AppDb, createDrizzle, Db, runMigrations, workspaces } from '../index.ts';
import { LabelsRepository } from '../labels/repository.ts';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));
const NOW = 1_700_000_000_000;

describe('labels reparent atomicity', () => {
  let db: Db;
  let drizzle: AppDb;
  let repo: LabelsRepository;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-labelrep-'));
    db = new Db();
    await db.open({ filename: join(tmpDir, 'app.db') });
    drizzle = createDrizzle(db);
    runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });
    repo = new LabelsRepository(drizzle);

    drizzle
      .insert(workspaces)
      .values({
        id: 'ws',
        name: 'W',
        slug: 'ws',
        rootPath: '/tmp/w',
        createdAt: NOW,
        updatedAt: NOW,
      })
      .run();
  });

  afterEach(async () => {
    db.dispose();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('reparent atualiza treeCode da label e de todos os descendentes', async () => {
    const root = await repo.create({ workspaceId: 'ws', name: 'Root' });
    const branch = await repo.create({
      workspaceId: 'ws',
      name: 'Branch',
      parentId: root.id,
    });
    const leaf = await repo.create({
      workspaceId: 'ws',
      name: 'Leaf',
      parentId: branch.id,
    });

    const otherRoot = await repo.create({ workspaceId: 'ws', name: 'OtherRoot' });

    // Move branch sob otherRoot
    await repo.reparent(branch.id, otherRoot.id);

    const updated = await repo.get(branch.id);
    const updatedLeaf = await repo.get(leaf.id);
    expect(updated?.parentId).toBe(otherRoot.id);
    expect(updated?.treeCode.startsWith(otherRoot.treeCode)).toBe(true);
    expect(updatedLeaf?.treeCode.startsWith(updated?.treeCode ?? '')).toBe(true);
  });

  it('reparent rollback quando parent não existe (descendentes intactos)', async () => {
    const root = await repo.create({ workspaceId: 'ws', name: 'Root' });
    const branch = await repo.create({
      workspaceId: 'ws',
      name: 'Branch',
      parentId: root.id,
    });
    const leaf = await repo.create({
      workspaceId: 'ws',
      name: 'Leaf',
      parentId: branch.id,
    });

    const beforeBranch = branch.treeCode;
    const beforeLeaf = leaf.treeCode;

    await expect(repo.reparent(branch.id, 'lbl-nonexistent' as LabelId)).rejects.toThrow();

    // Sem rollback transacional, o leaf poderia ter treeCode atualizado
    // mesmo com falha no parent — a transaction garante atomicidade.
    const afterBranch = await repo.get(branch.id);
    const afterLeaf = await repo.get(leaf.id);
    expect(afterBranch?.treeCode).toBe(beforeBranch);
    expect(afterLeaf?.treeCode).toBe(beforeLeaf);
  });
});
