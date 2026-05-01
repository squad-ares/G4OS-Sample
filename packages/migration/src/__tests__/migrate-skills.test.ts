import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepContext } from '../steps/contract.ts';
import { migrateSkills } from '../steps/migrate-skills.ts';
import type { MigrationStep } from '../types.ts';

describe('migrateSkills', () => {
  let v1Path: string;
  let v2Path: string;

  beforeEach(async () => {
    const base = join(tmpdir(), `g4os-skills-test-${Date.now()}-${Math.random()}`);
    v1Path = join(base, 'v1');
    v2Path = join(base, 'v2');
    await mkdir(v1Path, { recursive: true });
    await mkdir(v2Path, { recursive: true });
  });

  afterEach(async () => {
    await rm(join(v1Path, '..'), { recursive: true, force: true }).catch(() => undefined);
  });

  function makeCtx(overrides: Partial<StepContext> = {}): StepContext {
    const step: MigrationStep = {
      kind: 'skills',
      description: 'Skills',
      count: 0,
      estimatedBytes: 0,
    };
    return {
      sourcePath: v1Path,
      targetPath: v2Path,
      step,
      stepIndex: 0,
      stepCount: 1,
      onProgress: vi.fn(),
      dryRun: false,
      options: {},
      ...overrides,
    };
  }

  it('returns empty when V1 has no skills/ dir', async () => {
    const result = await migrateSkills(makeCtx());
    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.itemsMigrated).toBe(0);
  });

  it('copies skills from V1 to skills-legacy/ in V2', async () => {
    const skill1 = join(v1Path, 'skills', 'hello-world');
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, 'skill.json'), '{"name":"hello"}');
    await writeFile(join(skill1, 'skill.md'), '# Hello');

    const result = await migrateSkills(makeCtx());
    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.itemsMigrated).toBe(1);
    expect(existsSync(join(v2Path, 'skills-legacy', 'hello-world', 'skill.json'))).toBe(true);
    expect(existsSync(join(v2Path, 'skills-legacy', 'hello-world', 'skill.md'))).toBe(true);
  });

  it('always emits warning about V2 feature not yet available', async () => {
    const skill1 = join(v1Path, 'skills', 's1');
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, 'skill.json'), '{}');

    const result = await migrateSkills(makeCtx());
    expect(
      result.isOk() &&
        result.value.nonFatalWarnings.some((w) => w.includes('skills V2 ainda não disponível')),
    ).toBe(true);
  });

  it('dry-run does not copy bytes', async () => {
    const skill1 = join(v1Path, 'skills', 's1');
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, 'skill.json'), '{}');

    const result = await migrateSkills(makeCtx({ dryRun: true }));
    expect(result.isOk() && result.value.itemsMigrated).toBe(1);
    expect(existsSync(join(v2Path, 'skills-legacy'))).toBe(false);
  });

  it('idempotent: skipa quando skills-legacy/ já existe', async () => {
    const skill1 = join(v1Path, 'skills', 's1');
    await mkdir(skill1, { recursive: true });
    await writeFile(join(skill1, 'skill.json'), '{}');
    await mkdir(join(v2Path, 'skills-legacy'), { recursive: true });

    const result = await migrateSkills(makeCtx());
    expect(result.isOk() && result.value.itemsMigrated).toBe(0);
    expect(result.isOk() && result.value.itemsSkipped).toBe(1);
    expect(
      result.isOk() && result.value.nonFatalWarnings.some((w) => w.includes('já existe em V2')),
    ).toBe(true);
  });
});
