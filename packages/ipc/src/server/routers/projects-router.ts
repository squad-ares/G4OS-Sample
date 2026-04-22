import {
  ProjectCreateInputSchema,
  ProjectIdSchema,
  ProjectPatchSchema,
  ProjectTaskCreateInputSchema,
  ProjectTaskPatchSchema,
  WorkspaceIdSchema,
} from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const ProjectTaskIdSchema = z.uuid();

const LegacyImportEntrySchema = z.object({
  path: z.string(),
  name: z.string(),
  slug: z.string(),
  existingId: z.string().optional(),
  description: z.string().optional(),
  decision: z.enum(['import', 'keep', 'skip']),
});

export const projectsRouter = router({
  list: authed.input(z.object({ workspaceId: WorkspaceIdSchema })).query(async ({ input, ctx }) => {
    const result = await ctx.projects.list(input.workspaceId);
    if (result.isErr()) throw result.error;
    return result.value;
  }),

  listArchived: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema }))
    .query(async ({ input, ctx }) => {
      const result = await ctx.projects.listArchived(input.workspaceId);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  get: authed.input(z.object({ id: ProjectIdSchema })).query(async ({ input, ctx }) => {
    const result = await ctx.projects.get(input.id);
    if (result.isErr()) throw result.error;
    return result.value;
  }),

  create: authed.input(ProjectCreateInputSchema).mutation(async ({ input, ctx }) => {
    const result = await ctx.projects.create(input);
    if (result.isErr()) throw result.error;
    return result.value;
  }),

  update: authed
    .input(z.object({ id: ProjectIdSchema, patch: ProjectPatchSchema }))
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.projects.update(input.id, input.patch);
      if (result.isErr()) throw result.error;
    }),

  archive: authed.input(z.object({ id: ProjectIdSchema })).mutation(async ({ input, ctx }) => {
    const result = await ctx.projects.archive(input.id);
    if (result.isErr()) throw result.error;
  }),

  restore: authed.input(z.object({ id: ProjectIdSchema })).mutation(async ({ input, ctx }) => {
    const result = await ctx.projects.restore(input.id);
    if (result.isErr()) throw result.error;
  }),

  delete: authed.input(z.object({ id: ProjectIdSchema })).mutation(async ({ input, ctx }) => {
    const result = await ctx.projects.delete(input.id);
    if (result.isErr()) throw result.error;
  }),

  listFiles: authed
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ input, ctx }) => {
      const result = await ctx.projects.listFiles(input.projectId);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  getFileContent: authed
    .input(z.object({ projectId: ProjectIdSchema, relativePath: z.string() }))
    .query(async ({ input, ctx }) => {
      const result = await ctx.projects.getFileContent(input.projectId, input.relativePath);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  saveFile: authed
    .input(z.object({ projectId: ProjectIdSchema, relativePath: z.string(), content: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.projects.saveFile(
        input.projectId,
        input.relativePath,
        input.content,
      );
      if (result.isErr()) throw result.error;
    }),

  deleteFile: authed
    .input(z.object({ projectId: ProjectIdSchema, relativePath: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.projects.deleteFile(input.projectId, input.relativePath);
      if (result.isErr()) throw result.error;
    }),

  listTasks: authed
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ input, ctx }) => {
      const result = await ctx.projects.listTasks(input.projectId);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  createTask: authed.input(ProjectTaskCreateInputSchema).mutation(async ({ input, ctx }) => {
    const result = await ctx.projects.createTask(input);
    if (result.isErr()) throw result.error;
    return result.value;
  }),

  updateTask: authed
    .input(z.object({ id: ProjectTaskIdSchema, patch: ProjectTaskPatchSchema }))
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.projects.updateTask(input.id, input.patch);
      if (result.isErr()) throw result.error;
    }),

  deleteTask: authed
    .input(z.object({ id: ProjectTaskIdSchema }))
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.projects.deleteTask(input.id);
      if (result.isErr()) throw result.error;
    }),

  listSessions: authed
    .input(z.object({ projectId: ProjectIdSchema }))
    .query(async ({ input, ctx }) => {
      const result = await ctx.projects.listSessions(input.projectId);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  hasLegacyImportDone: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema }))
    .query(async ({ input, ctx }) => {
      const result = await ctx.projects.hasLegacyImportDone(input.workspaceId);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  discoverLegacyProjects: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema, workingDirectory: z.string() }))
    .query(async ({ input, ctx }) => {
      const result = await ctx.projects.discoverLegacyProjects(
        input.workspaceId,
        input.workingDirectory,
      );
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  importLegacyProjects: authed
    .input(
      z.object({
        workspaceId: WorkspaceIdSchema,
        entries: z.array(LegacyImportEntrySchema),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const entries = input.entries.map((e) => ({
        path: e.path,
        name: e.name,
        slug: e.slug,
        ...(e.existingId === undefined ? {} : { existingId: e.existingId }),
        ...(e.description === undefined ? {} : { description: e.description }),
        decision: e.decision,
      }));
      const result = await ctx.projects.importLegacyProjects(input.workspaceId, entries);
      if (result.isErr()) throw result.error;
      return result.value;
    }),
});
