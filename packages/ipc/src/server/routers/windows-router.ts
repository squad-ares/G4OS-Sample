import { WorkspaceIdSchema } from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

export const windowsRouter = router({
  openWorkspaceWindow: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.windows.openWorkspaceWindow(input.workspaceId);
      if (result.isErr()) throw result.error;
    }),
});
