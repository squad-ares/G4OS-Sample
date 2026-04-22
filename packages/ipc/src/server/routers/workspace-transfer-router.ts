import { WorkspaceIdSchema } from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const ExportSummarySchema = z.object({
  path: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  filesIncluded: z.number().int().nonnegative(),
});

const ImportSummarySchema = z.object({
  workspaceId: WorkspaceIdSchema,
  warnings: z.array(z.string()),
});

export const workspaceTransferRouter = router({
  exportWorkspace: authed
    .input(
      z.object({
        workspaceId: WorkspaceIdSchema,
        outputPath: z.string().min(1),
      }),
    )
    .output(ExportSummarySchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.workspaceTransfer.exportWorkspace(input);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  importWorkspace: authed
    .input(z.object({ zipPath: z.string().min(1) }))
    .output(ImportSummarySchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.workspaceTransfer.importWorkspace(input);
      if (result.isErr()) throw result.error;
      return { ...result.value, warnings: [...result.value.warnings] };
    }),
});
