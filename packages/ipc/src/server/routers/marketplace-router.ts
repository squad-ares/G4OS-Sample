import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

/**
 * Schema mínimo enquanto domínio de marketplace não materializa.
 * Antes era `z.unknown()` — vide nota em `agents-router.ts`.
 */
const MarketplaceItemSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
  })
  .passthrough();

export const marketplaceRouter = router({
  list: authed
    .input(z.void())
    .output(z.array(MarketplaceItemSchema).readonly())
    .query(async ({ ctx }) => {
      const result = await ctx.marketplace.list();
      if (result.isErr()) throw result.error;
      return [...result.value]
        .map((item) => MarketplaceItemSchema.safeParse(item))
        .flatMap((r) => (r.success ? [r.data] : []));
    }),
});
