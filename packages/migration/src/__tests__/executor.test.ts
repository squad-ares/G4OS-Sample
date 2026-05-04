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

  it('rolls back step-written paths on failure (CR-18 F-M1: surgical, NÃO rm -rf no target)', async () => {
    // Adiciona credentials.enc no V1 fixture pra forçar migrate-credentials
    // a entrar no caminho que requer vault. Sem stepOptions.vault, retorna err.
    await writeFile(join(v1Path, 'credentials.enc'), Buffer.alloc(64));

    // Pré-popular o target com um arquivo "produtivo" simulando V2 ativa
    // — o rollback NÃO pode tocar nesse arquivo (regressão F-M1).
    await mkdir(v2Path, { recursive: true });
    const productiveV2File = join(v2Path, 'workspaces.sqlite');
    await writeFile(productiveV2File, 'productive v2 data', 'utf-8');

    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    const result = await execute(plan, {
      dryRun: false,
      force: false,
      onProgress: vi.fn(),
      stepFilter: new Set(['credentials']),
    });
    expect(result.isErr()).toBe(true);
    // Target dir continua existindo (foi criado pelo lockfile setup) mas o
    // arquivo produtivo NÃO pode ter sido removido pelo rollback.
    expect(existsSync(productiveV2File)).toBe(true);
    const productiveContent = await readFile(productiveV2File, 'utf-8');
    expect(productiveContent).toBe('productive v2 data');
    // Marker NUNCA foi escrito (step falhou antes).
    expect(existsSync(join(v2Path, MIGRATION_DONE_MARKER))).toBe(false);
  });

  it('rejects parallel execute via lockfile (CR-18 F-M2)', async () => {
    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    // Cria o lock manualmente com pid do processo atual — simula outra instância
    // rodando (pid vivo não é tratado como stale por F-CR40-5).
    await mkdir(v2Path, { recursive: true });
    await writeFile(join(v2Path, '.migration.lock'), `pid=${process.pid}\n`, 'utf-8');

    const result = await execute(plan, {
      dryRun: false,
      force: false,
      onProgress: vi.fn(),
      stepFilter: new Set(['config']),
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toMatch(/já em curso|EEXIST/i);
    }
  });

  // F-CR40-9: managedRoot validation.
  it('F-CR40-9: rejeita target fora do managedRoot', async () => {
    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    const result = await execute(plan, {
      dryRun: false,
      force: false,
      onProgress: vi.fn(),
      stepFilter: new Set(['config']),
      managedRoot: '/some/other/managed/root',
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toMatch(/fora do managedRoot/i);
    }
  });

  // F-CR40-17: partialSuccess quando steps têm alta taxa de skip.
  it('F-CR40-17: partialSuccess=false quando tudo migra com sucesso', async () => {
    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    const result = await execute(plan, {
      dryRun: false,
      force: false,
      onProgress: vi.fn(),
      stepFilter: new Set(['config']),
    });
    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.partialSuccess).toBe(false);
    expect(result.isOk() && result.value.degradedSteps).toHaveLength(0);
  });

  it('re-checks marker after lock acquisition (CR-18 F-M2 race)', async () => {
    // Plan capturado ANTES da migração simulada (alreadyMigrated=false).
    const plan = await createMigrationPlan({ source: makeV1Install(), target: v2Path });
    expect(plan.alreadyMigrated).toBe(false);

    // Outra instância "concluiu" — escreve o marker no target.
    await mkdir(v2Path, { recursive: true });
    await writeFile(
      join(v2Path, MIGRATION_DONE_MARKER),
      JSON.stringify({ version: '1.0', finishedAt: Date.now() }),
      'utf-8',
    );

    const result = await execute(plan, {
      dryRun: false,
      force: false,
      onProgress: vi.fn(),
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toMatch(/outra invocação/i);
    }
    // Lock deve ter sido liberado mesmo no retorno err.
    expect(existsSync(join(v2Path, '.migration.lock'))).toBe(false);
  });
});
