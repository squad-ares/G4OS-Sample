import { WorkspaceIdSchema, WorkspaceSchema, WorkspaceUpdateSchema } from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const WorkspacesListOutput = z.array(WorkspaceSchema);

const WorkspaceSetupNeedsSchema = z.object({
  needsInitialSetup: z.boolean(),
  needsStyleSetup: z.boolean(),
  isFullyConfigured: z.boolean(),
});

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
        patch: WorkspaceUpdateSchema,
      }),
    )
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
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

  /**
   * Retorna flags de setup do workspace para o renderer decidir se
   * dispara onboarding session automática (`/setup` skill ou prompt
   * guiado no primeiro turn). Lê `setupCompleted` + `styleSetupCompleted`.
   */
  getSetupNeeds: authed
    .input(z.object({ id: WorkspaceIdSchema }))
    .output(WorkspaceSetupNeedsSchema)
    .query(async ({ input, ctx }) => {
      const result = await ctx.workspaces.getSetupNeeds(input.id);
      if (result.isErr()) throw result.error;
      return result.value;
    }),
});
