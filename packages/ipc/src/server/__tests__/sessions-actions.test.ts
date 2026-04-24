import { randomUUID } from 'node:crypto';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { createTestCaller } from './helpers/create-test-caller.ts';

describe('sessions router — actions (TASK-11-00-08)', () => {
  it('stopTurn delegates to ctx.sessions.stopTurn', async () => {
    const stopTurn = vi.fn(async () => ok(undefined));
    const caller = createTestCaller({
      sessions: {
        list: async () => ok([]),
        get: async () => err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'x' })),
        create: async () => err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'x' })),
        update: async () => ok(undefined),
        delete: async () => ok(undefined),
        subscribe: () => ({ dispose: () => undefined }),
        stopTurn,
        retryLastTurn: async () => ok(undefined),
        truncateAfter: async () => ok({ removed: 0 }),
      },
    });
    const id = randomUUID();
    await caller.sessions.stopTurn({ id });
    expect(stopTurn).toHaveBeenCalledWith(id);
  });

  it('retryLastTurn delegates to ctx.sessions.retryLastTurn', async () => {
    const retryLastTurn = vi.fn(async () => ok(undefined));
    const caller = createTestCaller({
      sessions: {
        list: async () => ok([]),
        get: async () => err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'x' })),
        create: async () => err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'x' })),
        update: async () => ok(undefined),
        delete: async () => ok(undefined),
        subscribe: () => ({ dispose: () => undefined }),
        stopTurn: async () => ok(undefined),
        retryLastTurn,
        truncateAfter: async () => ok({ removed: 0 }),
      },
    });
    const id = randomUUID();
    await caller.sessions.retryLastTurn({ id });
    expect(retryLastTurn).toHaveBeenCalledWith(id);
  });

  it('truncateAfter requires confirm=true and returns removed count', async () => {
    const truncateAfter = vi.fn(async () => ok({ removed: 3 }));
    const caller = createTestCaller({
      sessions: {
        list: async () => ok([]),
        get: async () => err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'x' })),
        create: async () => err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'x' })),
        update: async () => ok(undefined),
        delete: async () => ok(undefined),
        subscribe: () => ({ dispose: () => undefined }),
        stopTurn: async () => ok(undefined),
        retryLastTurn: async () => ok(undefined),
        truncateAfter,
      },
    });
    const id = randomUUID();
    const result = await caller.sessions.truncateAfter({ id, afterSequence: 5, confirm: true });
    expect(result).toEqual({ removed: 3 });
    expect(truncateAfter).toHaveBeenCalledWith(id, 5);
  });

  it('truncateAfter rejects without confirm', async () => {
    const caller = createTestCaller();
    const id = randomUUID();
    const badInput = { id, afterSequence: 5, confirm: false } as unknown as {
      readonly id: string;
      readonly afterSequence: number;
      readonly confirm: true;
    };
    await expect(caller.sessions.truncateAfter(badInput)).rejects.toThrow();
  });

  it('stopTurn propagates error from service', async () => {
    const caller = createTestCaller({
      sessions: {
        list: async () => ok([]),
        get: async () => err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'x' })),
        create: async () => err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'x' })),
        update: async () => ok(undefined),
        delete: async () => ok(undefined),
        subscribe: () => ({ dispose: () => undefined }),
        stopTurn: async () =>
          err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'no active turn' })),
        retryLastTurn: async () => ok(undefined),
        truncateAfter: async () => ok({ removed: 0 }),
      },
    });
    await expect(caller.sessions.stopTurn({ id: randomUUID() })).rejects.toThrow('no active turn');
  });
});
