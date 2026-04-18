import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const CredentialKeySchema = z.string().min(1).max(200);

export const credentialsRouter = router({
  get: authed
    .input(z.object({ key: CredentialKeySchema }))
    .output(z.string())
    .query(async ({ input, ctx }) => {
      const result = await ctx.credentials.get(input.key);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  set: authed
    .input(z.object({ key: CredentialKeySchema, value: z.string() }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.credentials.set(input.key, input.value);
      if (result.isErr()) throw result.error;
    }),

  delete: authed
    .input(z.object({ key: CredentialKeySchema }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.credentials.delete(input.key);
      if (result.isErr()) throw result.error;
    }),
});
