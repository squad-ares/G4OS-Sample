import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StepContext, V2SourceInput, V2SourceWriter } from '../steps/contract.ts';
import { migrateSources } from '../steps/migrate-sources.ts';
import type { MigrationStep } from '../types.ts';

describe('migrateSources', () => {
  let v1Path: string;
  let v2Path: string;

  beforeEach(async () => {
    const base = join(tmpdir(), `g4os-src-test-${Date.now()}-${Math.random()}`);
    v1Path = join(base, 'v1');
    v2Path = join(base, 'v2');
    await mkdir(v1Path, { recursive: true });
  });

  afterEach(async () => {
    await rm(join(v1Path, '..'), { recursive: true, force: true }).catch(() => undefined);
  });

  function makeCtx(overrides: Partial<StepContext> = {}): StepContext {
    const step: MigrationStep = {
      kind: 'sources',
      description: 'Sources',
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

  it('returns empty when V1 has no sources.json', async () => {
    const result = await migrateSources(makeCtx());
    expect(result.isOk()).toBe(true);
    expect(result.isOk() && result.value.itemsMigrated).toBe(0);
  });

  it('counts sources in read-only mode (no writer)', async () => {
    await writeFile(
      join(v1Path, 'sources.json'),
      JSON.stringify({
        sources: [
          { slug: 'gmail', kind: 'managed', workspaceIds: ['ws-1', 'ws-2'] },
          { slug: 'github', kind: 'mcp-stdio', workspaceIds: ['ws-1'] },
        ],
      }),
    );
    const result = await migrateSources(makeCtx());
    expect(result.isOk()).toBe(true);
    // gmail x 2 workspaces + github x 1 workspace = 3
    expect(result.isOk() && result.value.itemsMigrated).toBe(3);
  });

  it('skips sources with invalid kind', async () => {
    await writeFile(
      join(v1Path, 'sources.json'),
      JSON.stringify({
        sources: [
          { slug: 'broken', kind: 'unknown-kind', workspaceIds: ['ws-1'] },
          { slug: 'ok', kind: 'managed', workspaceIds: ['ws-1'] },
        ],
      }),
    );
    const result = await migrateSources(makeCtx());
    expect(result.isOk() && result.value.itemsMigrated).toBe(1);
    expect(result.isOk() && result.value.itemsSkipped).toBe(1);
    expect(
      result.isOk() && result.value.nonFatalWarnings.some((w) => w.includes('kind inválido')),
    ).toBe(true);
  });

  it('distributes globally to knownWorkspaceIds when workspaceIds missing', async () => {
    await writeFile(
      join(v1Path, 'sources.json'),
      JSON.stringify({
        sources: [{ slug: 'global-src', kind: 'managed' }],
      }),
    );
    const calls: V2SourceInput[] = [];
    const writer: V2SourceWriter = {
      exists: () => Promise.resolve(false),
      add: (input) => {
        calls.push(input);
        return Promise.resolve();
      },
    };
    const result = await migrateSources(
      makeCtx({
        options: { sourceWriter: writer, knownWorkspaceIds: ['ws-a', 'ws-b'] },
      }),
    );
    expect(result.isOk()).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls.map((c) => c.workspaceId).sort()).toEqual(['ws-a', 'ws-b']);
  });

  it('warns and skips when workspaceIds and knownWorkspaceIds both missing', async () => {
    await writeFile(
      join(v1Path, 'sources.json'),
      JSON.stringify({ sources: [{ slug: 'orphan', kind: 'managed' }] }),
    );
    const result = await migrateSources(makeCtx());
    expect(result.isOk() && result.value.itemsSkipped).toBe(1);
    expect(
      result.isOk() &&
        result.value.nonFatalWarnings.some((w) => w.includes('não há onde distribuir')),
    ).toBe(true);
  });

  it('respects idempotency via writer.exists', async () => {
    await writeFile(
      join(v1Path, 'sources.json'),
      JSON.stringify({
        sources: [{ slug: 'gmail', kind: 'managed', workspaceIds: ['ws-1'] }],
      }),
    );
    const writer: V2SourceWriter = {
      exists: (wid, slug) => Promise.resolve(wid === 'ws-1' && slug === 'gmail'),
      add: vi.fn(() => Promise.resolve()),
    };
    const result = await migrateSources(makeCtx({ options: { sourceWriter: writer } }));
    expect(result.isOk() && result.value.itemsSkipped).toBe(1);
    expect(writer.add).not.toHaveBeenCalled();
  });

  it('accepts array shape (without "sources" wrapper)', async () => {
    await writeFile(
      join(v1Path, 'sources.json'),
      JSON.stringify([{ slug: 'flat', kind: 'managed', workspaceIds: ['ws-1'] }]),
    );
    const result = await migrateSources(makeCtx());
    expect(result.isOk() && result.value.itemsMigrated).toBe(1);
  });
});
