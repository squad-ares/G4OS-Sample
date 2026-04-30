import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMigrationPlan, MIGRATION_DONE_MARKER } from '../plan.ts';
import type { V1Install } from '../types.ts';

describe('createMigrationPlan', () => {
  let v1Path: string;
  let v2Path: string;

  beforeEach(async () => {
    const base = join(tmpdir(), `g4os-plan-test-${Date.now()}-${Math.random()}`);
    v1Path = join(base, 'v1');
    v2Path = join(base, 'v2');
    await mkdir(v1Path, { recursive: true });
  });

  afterEach(async () => {
    await rm(join(v1Path, '..'), { recursive: true, force: true }).catch(() => undefined);
  });

  function makeV1Install(): V1Install {
    return { path: v1Path, version: '0.1.0', flavor: 'public' };
  }

  it('returns alreadyMigrated=true when marker exists in target', async () => {
    await mkdir(v2Path, { recursive: true });
    await writeFile(join(v2Path, MIGRATION_DONE_MARKER), '{}');

    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    expect(plan.alreadyMigrated).toBe(true);
    expect(plan.steps).toEqual([]);
  });

  it('produces 6 steps with zero counts when V1 is empty', async () => {
    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    expect(plan.alreadyMigrated).toBe(false);
    expect(plan.steps).toHaveLength(6);
    expect(plan.steps.every((s) => s.count === 0)).toBe(true);
    expect(plan.estimatedSize).toBe(0);
  });

  it('counts config when config.json exists', async () => {
    await writeFile(join(v1Path, 'config.json'), JSON.stringify({ version: '0.1.0' }));
    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    const config = plan.steps.find((s) => s.kind === 'config');
    expect(config?.count).toBe(1);
    expect(config?.estimatedBytes).toBeGreaterThan(0);
  });

  it('counts credentials when credentials.enc exists', async () => {
    await writeFile(join(v1Path, 'credentials.enc'), Buffer.alloc(256));
    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    const creds = plan.steps.find((s) => s.kind === 'credentials');
    expect(creds?.count).toBe(1);
    expect(creds?.estimatedBytes).toBe(256);
  });

  it('counts workspaces by listing workspaces/ subdirs', async () => {
    const wsRoot = join(v1Path, 'workspaces');
    await mkdir(join(wsRoot, 'ws-1'), { recursive: true });
    await mkdir(join(wsRoot, 'ws-2'), { recursive: true });
    await writeFile(join(wsRoot, '.DS_Store'), 'noise'); // garante que arquivo é ignorado

    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    const ws = plan.steps.find((s) => s.kind === 'workspaces');
    expect(ws?.count).toBe(2);
  });

  it('counts sessions across all workspaces', async () => {
    await mkdir(join(v1Path, 'workspaces', 'ws-1', 'sessions', 'sess-a'), { recursive: true });
    await writeFile(
      join(v1Path, 'workspaces', 'ws-1', 'sessions', 'sess-a', 'session.json'),
      JSON.stringify({ name: 'a' }),
    );
    await mkdir(join(v1Path, 'workspaces', 'ws-2', 'sessions', 'sess-b'), { recursive: true });
    await writeFile(
      join(v1Path, 'workspaces', 'ws-2', 'sessions', 'sess-b', 'session.jsonl'),
      'line1\nline2\n',
    );

    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    const sessions = plan.steps.find((s) => s.kind === 'sessions');
    expect(sessions?.count).toBe(2);
    expect(sessions?.estimatedBytes).toBeGreaterThan(0);
  });

  it('warns when version is null', async () => {
    const sourceWithNullVersion: V1Install = { path: v1Path, version: null, flavor: 'public' };
    const plan = await createMigrationPlan({ source: sourceWithNullVersion, target: v2Path });
    expect(plan.warnings.some((w) => w.includes('version desconhecida'))).toBe(true);
  });

  it('warns when workspaces/ dir is missing', async () => {
    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    expect(plan.warnings.some((w) => w.includes('workspaces/'))).toBe(true);
  });
});
