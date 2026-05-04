import { WorkspaceIdSchema } from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

// Caps em campos de Permission. `toolName` em uso fica < 50 chars.
// `argsHash` é sempre SHA-256 hex 64 chars exatos (legacy 32 chars era
// suportado em find/persist mas writes novos usam 64). `argsPreview` é
// truncado em 200 chars no store. Caps espelham invariantes do produtor.
const PermissionDecisionViewSchema = z.object({
  toolName: z.string().min(1).max(256),
  argsHash: z
    .string()
    .min(32)
    .max(64)
    .regex(/^[a-f0-9]+$/),
  argsPreview: z.string().max(256),
  decidedAt: z.number().int().finite().positive(),
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
        toolName: z.string().min(1).max(256),
        argsHash: z
          .string()
          .min(32)
          .max(64)
          .regex(/^[a-f0-9]+$/),
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
