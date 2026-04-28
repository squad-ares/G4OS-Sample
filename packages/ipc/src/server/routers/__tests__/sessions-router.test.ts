import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { createTestCaller } from '../../__tests__/helpers/create-test-caller.ts';

describe('sessions router (contract tests)', () => {
  describe('list', () => {
    it('returns empty array from mock', async () => {
      const caller = createTestCaller();
      const result = await caller.sessions.list({
        workspaceId: '00000000-0000-4000-8000-000000000001',
      });
      expect(Array.isArray(result)).toBe(true);
    });

    it('requires authentication', async () => {
      const caller = createTestCaller({ session: undefined });
      await expect(
        caller.sessions.list({ workspaceId: '00000000-0000-4000-8000-000000000001' }),
      ).rejects.toThrow(TRPCError);
    });

    it('rejects invalid workspaceId via schema', async () => {
      const caller = createTestCaller();
      await expect(caller.sessions.list({ workspaceId: 'not-a-uuid' })).rejects.toThrow();
    });
  });

  describe('delete', () => {
    it('requires explicit confirm: true', async () => {
      const caller = createTestCaller();
      await expect(
        // @ts-expect-error testing schema rejection of confirm: false
        caller.sessions.delete({ id: '00000000-0000-4000-8000-000000000001', confirm: false }),
      ).rejects.toThrow();
    });
  });

  describe('respondPermission', () => {
    it('rejects invalid decision values', async () => {
      const caller = createTestCaller();
      await expect(
        caller.sessions.respondPermission({
          requestId: '00000000-0000-4000-8000-000000000001',
          // @ts-expect-error testing enum rejection
          decision: 'invalid_decision',
        }),
      ).rejects.toThrow();
    });
  });
});
