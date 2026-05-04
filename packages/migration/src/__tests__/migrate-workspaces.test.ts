import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepContext, V2WorkspaceWriter } from '../steps/contract.ts';
import { migrateWorkspaces } from '../steps/migrate-workspaces.ts';
import type { MigrationStep } from '../types.ts';

describe('migrateWorkspaces', () => {
  let v1Path: string;
  let v2Path: string;

  beforeEach(async () => {
    const base = join(tmpdir(), `g4os-ws-test-${Date.now()}-${Math.random()}`);
    v1Path = join(base, 'v1');
    v2Path = join(base, 'v2');
    await mkdir(v1Path, { recursive: true });
  });

  afterEach(async () => {
    await rm(join(v1Path, '..'), { recursive: true, force: true }).catch(() => undefined);
  });

  function makeCtx(overrides: Partial<StepContext> = {}): StepContext {
    const step: MigrationStep = {
      kind: 'workspaces',
      description: 'Workspaces',
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

  it('returns empty result when V1 has no workspaces dir', async () => {
    const result = await migrateWorkspaces(makeCtx());
    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.itemsMigrated).toBe(0);
  });

  it('counts workspaces in read-only mode (no writer)', async () => {
    await mkdir(join(v1Path, 'workspaces', 'ws-uuid-1'), { recursive: true });
    await writeFile(
      join(v1Path, 'workspaces', 'ws-uuid-1', 'workspace.json'),
      JSON.stringify({ id: 'ws-uuid-1', name: 'My WS', slug: 'my-ws' }),
    );
    await mkdir(join(v1Path, 'workspaces', 'ws-uuid-2'), { recursive: true });
    await writeFile(
      join(v1Path, 'workspaces', 'ws-uuid-2', 'workspace.json'),
      JSON.stringify({ id: 'ws-uuid-2', name: 'Other WS' }),
    );

    const result = await migrateWorkspaces(makeCtx());
    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.itemsMigrated).toBe(2);
  });

  it('skips dirs without workspace.json with warning', async () => {
    await mkdir(join(v1Path, 'workspaces', 'orphan-dir'), { recursive: true });
    const result = await migrateWorkspaces(makeCtx());
    expect(result.isOk() && result.value.itemsSkipped).toBe(1);
    expect(
      result.isOk() &&
        result.value.nonFatalWarnings.some((w) => w.includes('workspace.json ausente')),
    ).toBe(true);
  });

  it('skips dirs with malformed JSON with warning', async () => {
    await mkdir(join(v1Path, 'workspaces', 'broken'), { recursive: true });
    await writeFile(join(v1Path, 'workspaces', 'broken', 'workspace.json'), 'not-json{');
    const result = await migrateWorkspaces(makeCtx());
    expect(result.isOk() && result.value.itemsSkipped).toBe(1);
    expect(
      result.isOk() && result.value.nonFatalWarnings.some((w) => w.includes('malformado')),
    ).toBe(true);
  });

  it('uses dir name as id when V1 omits id field', async () => {
    await mkdir(join(v1Path, 'workspaces', 'fallback-id'), { recursive: true });
    await writeFile(
      join(v1Path, 'workspaces', 'fallback-id', 'workspace.json'),
      JSON.stringify({ name: 'Without Id' }),
    );

    const calls: { id: string; name: string; slug: string }[] = [];
    const writer: V2WorkspaceWriter = {
      exists: () => Promise.resolve(false),
      create: (input) => {
        calls.push({ id: input.id, name: input.name, slug: input.slug });
        return Promise.resolve();
      },
    };
    const result = await migrateWorkspaces(makeCtx({ options: { workspaceWriter: writer } }));
    expect(result.isOk()).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.id).toBe('fallback-id');
    expect(calls[0]?.name).toBe('Without Id');
    expect(calls[0]?.slug).toBe('without-id');
  });

  it('skips workspaces that already exist in V2 (idempotent)', async () => {
    await mkdir(join(v1Path, 'workspaces', 'ws-1'), { recursive: true });
    await writeFile(
      join(v1Path, 'workspaces', 'ws-1', 'workspace.json'),
      JSON.stringify({ id: 'ws-1', name: 'A' }),
    );

    const writer: V2WorkspaceWriter = {
      exists: (id) => Promise.resolve(id === 'ws-1'),
      create: vi.fn(() => Promise.resolve()),
    };
    const result = await migrateWorkspaces(makeCtx({ options: { workspaceWriter: writer } }));
    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.itemsSkipped).toBe(1);
    expect(result.isOk() && result.value.itemsMigrated).toBe(0);
    expect(writer.create).not.toHaveBeenCalled();
  });

  it('respects dryRun even when writer is provided', async () => {
    await mkdir(join(v1Path, 'workspaces', 'ws-1'), { recursive: true });
    await writeFile(
      join(v1Path, 'workspaces', 'ws-1', 'workspace.json'),
      JSON.stringify({ id: 'ws-1', name: 'A' }),
    );

    const writer: V2WorkspaceWriter = {
      exists: vi.fn(() => Promise.resolve(false)),
      create: vi.fn(() => Promise.resolve()),
    };
    const result = await migrateWorkspaces(
      makeCtx({ dryRun: true, options: { workspaceWriter: writer } }),
    );
    expect(result.isOk()).toBe(true);
    expect(writer.create).not.toHaveBeenCalled();
  });
});
