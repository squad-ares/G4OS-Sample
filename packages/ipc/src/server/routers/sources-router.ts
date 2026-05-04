import {
  CreateMcpHttpSourceInputSchema,
  CreateMcpStdioSourceInputSchema,
  EnableManagedSourceInputSchema,
  SourceCatalogItemSchema,
  SourceConfigViewSchema,
  SourceIdSchema,
  SourceStatusSchema,
  WorkspaceIdSchema,
} from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

export const sourcesRouter = router({
  list: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema }))
    .output(z.array(SourceConfigViewSchema))
    .query(async ({ input, ctx }) => {
      const result = await ctx.sources.list(input.workspaceId);
      if (result.isErr()) throw result.error;
      return [...result.value];
    }),

  listAvailable: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema }))
    .output(z.array(SourceCatalogItemSchema))
    .query(async ({ input, ctx }) => {
      const result = await ctx.sources.listAvailable(input.workspaceId);
      if (result.isErr()) throw result.error;
      return [...result.value];
    }),

  get: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema, id: SourceIdSchema }))
    .output(SourceConfigViewSchema)
    .query(async ({ input, ctx }) => {
      const result = await ctx.sources.get(input.workspaceId, input.id);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  enableManaged: authed
    .input(EnableManagedSourceInputSchema)
    .output(SourceConfigViewSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sources.enableManaged(input);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  createStdio: authed
    .input(CreateMcpStdioSourceInputSchema)
    .output(SourceConfigViewSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sources.createStdio(input);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  createHttp: authed
    .input(CreateMcpHttpSourceInputSchema)
    .output(SourceConfigViewSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sources.createHttp(input);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  setEnabled: authed
    .input(
      z.object({
        workspaceId: WorkspaceIdSchema,
        id: SourceIdSchema,
        enabled: z.boolean(),
      }),
    )
    .output(SourceConfigViewSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sources.setEnabled(input.workspaceId, input.id, input.enabled);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  delete: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema, id: SourceIdSchema }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sources.delete(input.workspaceId, input.id);
      if (result.isErr()) throw result.error;
    }),

  testConnection: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema, id: SourceIdSchema }))
    .output(SourceStatusSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sources.testConnection(input.workspaceId, input.id);
      if (result.isErr()) throw result.error;
      return result.value;
    }),
});
