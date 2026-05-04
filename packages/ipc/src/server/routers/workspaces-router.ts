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
  list: authed
    .input(z.void())
    .output(WorkspacesListOutput)
    .query(async ({ ctx }) => {
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
    // rootPath é opcional na criação — quando ausente, o service deriva
    // `appPaths.workspace(id)` automaticamente (ver workspaces-service.ts:82).
    // Permite UX de auto-create no boot sem ter que conhecer paths internos.
    .input(
      z.object({
        name: WorkspaceSchema.shape.name,
        rootPath: WorkspaceSchema.shape.rootPath.optional(),
      }),
    )
    .output(WorkspaceSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.workspaces.create({
        name: input.name,
        rootPath: input.rootPath ?? '',
      });
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
      const result = await ctx.workspaces.update(input.id, input.patch);
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
