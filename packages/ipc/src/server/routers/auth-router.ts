import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { procedure, router } from '../trpc.ts';

const IpcSessionSchema = z.object({
  userId: z.string(),
  email: z.email(),
  expiresAt: z.number().int().positive().optional(),
});

export const authRouter = router({
  getMe: authed.output(IpcSessionSchema).query(async ({ ctx }) => {
    const result = await ctx.auth.getMe();
    if (result.isErr()) throw result.error;
    return result.value;
  }),

  sendOtp: procedure
    .input(z.object({ email: z.email() }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.auth.sendOtp(input.email);
      if (result.isErr()) throw result.error;
    }),

  verifyOtp: procedure
    .input(z.object({ email: z.email(), code: z.string().min(4).max(10) }))
    .output(IpcSessionSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.auth.verifyOtp(input.email, input.code);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  signOut: authed.output(z.void()).mutation(async ({ ctx }) => {
    const result = await ctx.auth.signOut();
    if (result.isErr()) throw result.error;
  }),
});
