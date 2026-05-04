import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { createTestCaller } from './helpers/create-test-caller.ts';

describe('migration router', () => {
  it('detect delegates to ctx.migration.detect', async () => {
    const detect = vi.fn(async () => ok(null));
    const caller = createTestCaller({ migration: { detect, plan: async () => ok({} as never) } });
    const result = await caller.migration.detect();
    expect(detect).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('detect returns V1Install when detected', async () => {
    const detect = vi.fn(async () =>
      ok({ path: '/home/u/.g4os', version: '0.5.1', flavor: 'public' as const }),
    );
    const caller = createTestCaller({ migration: { detect, plan: async () => ok({} as never) } });
    const result = await caller.migration.detect();
    expect(result?.path).toBe('/home/u/.g4os');
    expect(result?.version).toBe('0.5.1');
  });

  it('execute delegates with input', async () => {
    const reportFixture = {
      source: '/v1',
      target: '/v2',
      v1Version: '0.5.1',
      startedAt: 1000,
      finishedAt: 2000,
      stepResults: [],
      backupPath: '/v1.backup-123',
      success: true,
    };
    const execute = vi.fn(async () => ok(reportFixture));
    const caller = createTestCaller({
      migration: {
        detect: async () => ok(null),
        plan: async () => ok({} as never),
        execute,
      },
    });

    await caller.migration.execute({ dryRun: true });
    expect(execute).toHaveBeenCalledWith({ dryRun: true });

    const result = await caller.migration.execute({
      source: { path: '/x', version: null, flavor: 'public' },
      v1MasterKey: 'secret',
    });
    expect(execute).toHaveBeenLastCalledWith({
      source: { path: '/x', version: null, flavor: 'public' },
      v1MasterKey: 'secret',
    });
    expect(result.success).toBe(true);
  });

  it('plan delegates with optional source/target', async () => {
    const plan = vi.fn(async () =>
      ok({
        source: { path: '/v1', version: null, flavor: 'public' as const },
        target: '/v2',
        steps: [],
        estimatedSize: 0,
        warnings: [],
        alreadyMigrated: false,
      }),
    );
    const caller = createTestCaller({
      migration: { detect: async () => ok(null), plan },
    });
    await caller.migration.plan({});
    expect(plan).toHaveBeenCalledWith({});

    await caller.migration.plan({
      source: { path: '/x', version: null, flavor: 'internal' },
      target: '/y',
    });
    expect(plan).toHaveBeenLastCalledWith({
      source: { path: '/x', version: null, flavor: 'internal' },
      target: '/y',
    });
  });
});
