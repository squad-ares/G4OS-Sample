import { z } from 'zod';
import { procedure, router } from '../trpc.ts';

export const platformRouter = router({
  readFileAsDataUrl: procedure
    .input(z.object({ path: z.string() }))
    .output(z.string())
    .query(async ({ input, ctx }) => {
      const shell = ctx.platform?.readFileAsDataUrl;
      if (!shell) throw new Error('readFileAsDataUrl not available');
      return await shell(input.path);
    }),

  openExternal: procedure.input(z.object({ url: z.url() })).mutation(async ({ input, ctx }) => {
    await ctx.platform?.openExternal?.(input.url);
  }),

  copyToClipboard: procedure
    .input(z.object({ text: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.platform?.copyToClipboard?.(input.text);
    }),

  showItemInFolder: procedure
    .input(z.object({ path: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.platform?.showItemInFolder?.(input.path);
    }),
});
