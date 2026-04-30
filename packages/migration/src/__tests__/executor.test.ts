import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { execute } from '../executor.ts';
import { createMigrationPlan, MIGRATION_DONE_MARKER } from '../plan.ts';
import type { V1Install } from '../types.ts';

describe('execute', () => {
  let v1Path: string;
  let v2Path: string;

  beforeEach(async () => {
    const base = join(tmpdir(), `g4os-exec-test-${Date.now()}-${Math.random()}`);
    v1Path = join(base, 'v1');
    v2Path = join(base, 'v2');
    await mkdir(v1Path, { recursive: true });
    await writeFile(
      join(v1Path, 'config.json'),
      JSON.stringify({ version: '0.1.0', theme: 'dark' }),
    );
  });

  afterEach(async () => {
    await rm(join(v1Path, '..'), { recursive: true, force: true }).catch(() => undefined);
  });

  function makeV1Install(): V1Install {
    return { path: v1Path, version: '0.1.0', flavor: 'public' };
  }

  it('refuses to execute when V2 already migrated and force=false', async () => {
    await mkdir(v2Path, { recursive: true });
    await writeFile(join(v2Path, MIGRATION_DONE_MARKER), '{}');

    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    const result = await execute(plan, {
      dryRun: false,
      force: false,
      onProgress: vi.fn(),
    });
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toMatch(/já migrado/);
  });

  it('dry-run does not write target or backup', async () => {
    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    const result = await execute(plan, {
      dryRun: true,
      force: false,
      onProgress: vi.fn(),
      stepFilter: new Set(['config']),
    });
    expect(result.isOk()).toBe(true);
    expect(existsSync(v2Path)).toBe(false);
    expect(result.isOk() && result.value.backupPath).toBeNull();
  });

  it('writes migration-config.json and .migration-done marker on real run', async () => {
    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    const result = await execute(plan, {
      dryRun: false,
      force: false,
      onProgress: vi.fn(),
      stepFilter: new Set(['config']),
    });
    expect(result.isOk()).toBe(true);
    expect(existsSync(join(v2Path, 'migration-config.json'))).toBe(true);
    expect(existsSync(join(v2Path, MIGRATION_DONE_MARKER))).toBe(true);

    const persisted = JSON.parse(await readFile(join(v2Path, 'migration-config.json'), 'utf-8'));
    expect(persisted.migratedFromV1).toBe(true);
    expect(persisted.known.version).toBe('0.1.0');
  });

  it('creates backup of V1 before executing', async () => {
    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    const result = await execute(plan, {
      dryRun: false,
      force: false,
      onProgress: vi.fn(),
      stepFilter: new Set(['config']),
    });
    expect(result.isOk()).toBe(true);
    const backup = result.isOk() ? result.value.backupPath : null;
    expect(backup).not.toBeNull();
    if (backup) {
      expect(existsSync(backup)).toBe(true);
      expect(existsSync(join(backup, 'config.json'))).toBe(true);
    }
  });

  it('emits progress events during step execution', async () => {
    const onProgress = vi.fn();
    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    await execute(plan, {
      dryRun: true,
      force: false,
      onProgress,
      stepFilter: new Set(['config']),
    });
    expect(onProgress).toHaveBeenCalled();
    const calls = onProgress.mock.calls.map((c) => c[0]);
    expect(calls.some((e) => e.stepProgress === 0)).toBe(true);
    expect(calls.some((e) => e.stepProgress === 1)).toBe(true);
  });

  it('rolls back V2 when a step fails (stub steps return err)', async () => {
    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    const result = await execute(plan, {
      dryRun: false,
      force: false,
      onProgress: vi.fn(),
      stepFilter: new Set(['credentials']), // stub — sempre err
    });
    expect(result.isErr()).toBe(true);
    expect(existsSync(v2Path)).toBe(false);
  });
});
