import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

export const sourcesRouter = router({
  list: authed
    .input(z.void())
    .output(z.array(z.unknown()))
    .query(async ({ ctx }) => {
      const result = await ctx.sources.list();
      if (result.isErr()) throw result.error;
      return [...result.value];
    }),
});
