import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const BackupEntrySchema = z.object({
  path: z.string(),
  workspaceId: z.string(),
  timestamp: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
});

const BackupRunResultSchema = z.object({
  entry: BackupEntrySchema,
});

export const backupRouter = router({
  list: authed
    .input(z.void())
    .output(z.array(BackupEntrySchema).readonly())
    .query(async ({ ctx }) => {
      const result = await ctx.backup.list();
      // CR-18 F-I3: throw `result.error` direto preserva `AppError`
      // (errorFormatter em trpc-base.ts depende de `cause instanceof
      // AppError`). Antes: TRPCError envelope strippava code/context/cause.
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  runNow: authed
    .input(z.object({ workspaceId: z.uuid() }))
    .output(BackupRunResultSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.backup.runNow(input.workspaceId);
      // CR-18 F-I3: throw `result.error` direto preserva `AppError`
      // (errorFormatter em trpc-base.ts depende de `cause instanceof
      // AppError`). Antes: TRPCError envelope strippava code/context/cause.
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  delete: authed
    .input(z.object({ path: z.string().min(1) }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.backup.delete(input.path);
      // CR-18 F-I3: throw `result.error` direto preserva `AppError`
      // (errorFormatter em trpc-base.ts depende de `cause instanceof
      // AppError`). Antes: TRPCError envelope strippava code/context/cause.
      if (result.isErr()) throw result.error;
    }),
});
