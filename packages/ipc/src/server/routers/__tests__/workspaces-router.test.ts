import { TRPCError } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { createTestCaller } from '../../__tests__/helpers/create-test-caller.ts';

describe('workspaces router', () => {
  describe('list', () => {
    it('returns empty list when mock has no workspaces', async () => {
      const caller = createTestCaller();
      const result = await caller.workspaces.list();
      expect(result).toEqual([]);
    });

    it('requires authentication', async () => {
      const caller = createTestCaller({ session: undefined });
      await expect(caller.workspaces.list()).rejects.toThrow(TRPCError);
    });
  });

  describe('create', () => {
    it('rejects empty workspace name via schema', async () => {
      const caller = createTestCaller();
      await expect(caller.workspaces.create({ name: '', rootPath: '/tmp' })).rejects.toThrow();
    });

    it('creates workspace with valid input', async () => {
      const caller = createTestCaller();
      const result = await caller.workspaces.create({
        name: 'My Workspace',
        rootPath: '/tmp/ws',
      });
      expect(result.id).toBeDefined();
      expect(result.name).toBe('My Workspace');
    });
  });
});
