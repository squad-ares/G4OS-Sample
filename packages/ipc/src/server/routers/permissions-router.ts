import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const WorkspaceIdSchema = z.uuid();

const PermissionDecisionViewSchema = z.object({
  toolName: z.string(),
  argsHash: z.string(),
  argsPreview: z.string(),
  decidedAt: z.number().int().positive(),
});

export const permissionsRouter = router({
  list: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema }))
    .output(z.array(PermissionDecisionViewSchema))
    .query(async ({ input, ctx }) => {
      const result = await ctx.permissions.list(input.workspaceId);
      if (result.isErr()) throw result.error;
      return [...result.value];
    }),

  revoke: authed
    .input(
      z.object({
        workspaceId: WorkspaceIdSchema,
        toolName: z.string().min(1),
        argsHash: z.string().min(1),
      }),
    )
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.permissions.revoke(
        input.workspaceId,
        input.toolName,
        input.argsHash,
      );
      if (result.isErr()) throw result.error;
    }),

  clearAll: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema }))
    .output(z.object({ removed: z.number().int().nonnegative() }))
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.permissions.clearAll(input.workspaceId);
      if (result.isErr()) throw result.error;
      return result.value;
    }),
});
