import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { createTestCaller } from '../../__tests__/helpers/create-test-caller.ts';

describe('credentials router (contract tests)', () => {
  describe('list', () => {
    it('requires authentication', async () => {
      const caller = createTestCaller({ session: undefined });
      await expect(caller.credentials.list()).rejects.toThrow(TRPCError);
    });
  });

  describe('set', () => {
    it('rejects empty key via schema', async () => {
      const caller = createTestCaller();
      await expect(caller.credentials.set({ key: '', value: 'v' })).rejects.toThrow();
    });

    it('accepts valid key + value', async () => {
      const caller = createTestCaller();
      await expect(
        caller.credentials.set({ key: 'anthropic-key', value: 'sk-foo' }),
      ).resolves.not.toThrow();
    });
  });
});
