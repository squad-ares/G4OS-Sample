import { MessageIdSchema, MessageSchema } from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const SessionIdSchema = z.uuid();

export const messagesRouter = router({
  list: authed
    .input(z.object({ sessionId: SessionIdSchema }))
    .output(z.array(MessageSchema))
    .query(async ({ input, ctx }) => {
      const result = await ctx.messages.list(input.sessionId);
      if (result.isErr()) throw result.error;
      return [...result.value];
    }),

  get: authed
    .input(z.object({ id: MessageIdSchema }))
    .output(MessageSchema)
    .query(async ({ input, ctx }) => {
      const result = await ctx.messages.get(input.id);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  append: authed
    .input(MessageSchema.pick({ sessionId: true, role: true, content: true }))
    .output(MessageSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.messages.append(input);
      if (result.isErr()) throw result.error;
      return result.value;
    }),
});
