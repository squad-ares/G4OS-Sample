import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepContext } from '../steps/contract.ts';
import { migrateCredentials } from '../steps/migrate-credentials.ts';
import type { MigrationStep } from '../types.ts';

describe('migrateCredentials', () => {
  let v1Path: string;

  beforeEach(async () => {
    const base = join(tmpdir(), `g4os-cred-test-${Date.now()}-${Math.random()}`);
    v1Path = join(base, 'v1');
    await mkdir(v1Path, { recursive: true });
  });

  afterEach(async () => {
    await rm(join(v1Path, '..'), { recursive: true, force: true }).catch(() => undefined);
  });

  function makeCtx(overrides: Partial<StepContext> = {}): StepContext {
    const step: MigrationStep = {
      kind: 'credentials',
      description: 'Credentials',
      count: 0,
      estimatedBytes: 0,
    };
    return {
      sourcePath: v1Path,
      targetPath: join(v1Path, '..', 'v2'),
      step,
      stepIndex: 0,
      stepCount: 1,
      onProgress: vi.fn(),
      dryRun: false,
      options: {},
      ...overrides,
    };
  }

  it('returns empty result when V1 has no credentials.enc', async () => {
    const result = await migrateCredentials(makeCtx());
    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.itemsMigrated).toBe(0);
  });

  it('returns err when credentials.enc exists but no vault is provided', async () => {
    await writeFile(join(v1Path, 'credentials.enc'), Buffer.alloc(64));
    const result = await migrateCredentials(makeCtx({ options: { v1MasterKey: 'secret' } }));
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toMatch(/vault/);
  });

  it('returns err when credentials.enc exists but no masterKey is provided', async () => {
    await writeFile(join(v1Path, 'credentials.enc'), Buffer.alloc(64));
    // Stub vault — não importa, valida só a checagem de masterKey
    const stubVault = {
      exists: () => Promise.resolve(false),
      set: () => Promise.resolve({ isErr: () => false }),
    } as unknown as import('@g4os/credentials').CredentialVault;

    const result = await migrateCredentials(makeCtx({ options: { vault: stubVault } }));
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.message).toMatch(/MasterKey/);
  });
});
