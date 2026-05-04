import { WorkspaceIdSchema } from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

/**
 * Schema mínimo enquanto domínio de scheduler jobs não materializa.
 * Antes era `z.unknown()` — vide nota em `agents-router.ts`.
 */
const SchedulerJobSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    workspaceId: z.string().min(1).optional(),
  })
  .passthrough();

export const schedulerRouter = router({
  list: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema }))
    .output(z.array(SchedulerJobSchema).readonly())
    .query(async ({ input, ctx }) => {
      const result = await ctx.scheduler.list(input.workspaceId);
      if (result.isErr()) throw result.error;
      return [...result.value]
        .map((item) => SchedulerJobSchema.safeParse(item))
        .flatMap((r) => (r.success ? [r.data] : []));
    }),
});
