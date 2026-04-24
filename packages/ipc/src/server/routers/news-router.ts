import { NewsItemSchema } from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

export const newsRouter = router({
  list: authed
    .input(z.void())
    .output(z.array(NewsItemSchema))
    .query(async ({ ctx }) => {
      const result = await ctx.news.list();
      if (result.isErr()) throw result.error;
      return [...result.value];
    }),

  get: authed
    .input(z.object({ id: z.string().min(1) }))
    .output(NewsItemSchema.nullable())
    .query(async ({ ctx, input }) => {
      const result = await ctx.news.get(input.id);
      if (result.isErr()) throw result.error;
      return result.value;
    }),
});
