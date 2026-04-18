import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const UpdateCheckOutput = z.object({
  hasUpdate: z.boolean(),
  version: z.string().optional(),
});

export const updatesRouter = router({
  check: authed
    .input(z.void())
    .output(UpdateCheckOutput)
    .query(async ({ ctx }) => {
      const result = await ctx.updates.check();
      if (result.isErr()) throw result.error;
      return result.value;
    }),
});
