import { LabelCreateSchema, LabelSchema, WorkspaceIdSchema } from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const LabelIdSchema = z.uuid();
const ColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/u)
  .nullable();

export const labelsRouter = router({
  list: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema }))
    .output(z.array(LabelSchema))
    .query(async ({ input, ctx }) => {
      const result = await ctx.labels.list(input.workspaceId);
      if (result.isErr()) throw result.error;
      return [...result.value];
    }),

  create: authed
    .input(LabelCreateSchema)
    .output(LabelSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.labels.create(input);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  rename: authed
    .input(z.object({ id: LabelIdSchema, name: z.string().min(1).max(80) }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.labels.rename(input.id, input.name);
      if (result.isErr()) throw result.error;
    }),

  recolor: authed
    .input(z.object({ id: LabelIdSchema, color: ColorSchema }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.labels.recolor(input.id, input.color);
      if (result.isErr()) throw result.error;
    }),

  reparent: authed
    .input(z.object({ id: LabelIdSchema, newParentId: LabelIdSchema.nullable() }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.labels.reparent(input.id, input.newParentId);
      if (result.isErr()) throw result.error;
    }),

  delete: authed
    .input(z.object({ id: LabelIdSchema }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.labels.delete(input.id);
      if (result.isErr()) throw result.error;
    }),
});
