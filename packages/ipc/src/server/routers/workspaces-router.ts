import { WorkspaceIdSchema, WorkspaceSchema } from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const WorkspacesListOutput = z.array(WorkspaceSchema);

export const workspacesRouter = router({
  list: authed.output(WorkspacesListOutput).query(async ({ ctx }) => {
    const result = await ctx.workspaces.list();
    if (result.isErr()) throw result.error;
    return [...result.value];
  }),

  get: authed
    .input(z.object({ id: WorkspaceIdSchema }))
    .output(WorkspaceSchema)
    .query(async ({ input, ctx }) => {
      const result = await ctx.workspaces.get(input.id);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  create: authed
    .input(WorkspaceSchema.pick({ name: true, rootPath: true }))
    .output(WorkspaceSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.workspaces.create(input);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  update: authed
    .input(
      z.object({
        id: WorkspaceIdSchema,
        patch: WorkspaceSchema.partial().omit({ id: true, createdAt: true }),
      }),
    )
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      // O partial() do Zod gera campos opcionais `| undefined`, que são
      // incompatíveis com exactOptionalPropertyTypes; o cast é seguro porque
      // valores em runtime omitem entradas `undefined` após o parse do Zod.
      const patch = input.patch as Parameters<typeof ctx.workspaces.update>[1];
      const result = await ctx.workspaces.update(input.id, patch);
      if (result.isErr()) throw result.error;
    }),

  delete: authed
    .input(
      z.object({
        id: WorkspaceIdSchema,
        removeFiles: z.boolean().optional(),
      }),
    )
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const { id, removeFiles } = input;
      const result = await ctx.workspaces.delete(
        id,
        removeFiles === undefined ? undefined : { removeFiles },
      );
      if (result.isErr()) throw result.error;
    }),
});
