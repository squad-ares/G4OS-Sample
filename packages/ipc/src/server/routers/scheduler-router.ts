import { WorkspaceIdSchema } from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

export const schedulerRouter = router({
  list: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema }))
    .output(z.array(z.unknown()))
    .query(async ({ input, ctx }) => {
      const result = await ctx.scheduler.list(input.workspaceId);
      if (result.isErr()) throw result.error;
      return [...result.value];
    }),
});
