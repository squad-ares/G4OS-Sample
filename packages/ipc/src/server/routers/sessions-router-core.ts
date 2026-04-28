/**
 * Sessions router — operações de lifecycle e organização da sessão.
 * CRUD, archive/restore, pin/star/markRead, branch, label.
 *
 * Subscriptions e operações de turn ficam em arquivos vizinhos:
 *   `sessions-router-runtime.ts`, `sessions-router-subscriptions.ts`.
 * Composição via spread em `sessions-router.ts` (CR4-04).
 */

import {
  LabelIdSchema,
  SessionFilterSchema,
  SessionIdSchema,
  SessionSchema,
  SessionUpdateSchema,
  WorkspaceIdSchema,
} from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const SessionsListOutput = z.array(SessionSchema);
const SessionListPageSchema = z.object({
  items: z.array(SessionSchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const sessionsCoreRouter = router({
  list: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema }))
    .output(SessionsListOutput)
    .query(async ({ input, ctx }) => {
      const result = await ctx.sessions.list(input.workspaceId);
      if (result.isErr()) throw result.error;
      return [...result.value];
    }),

  listFiltered: authed
    .input(SessionFilterSchema)
    .output(SessionListPageSchema)
    .query(async ({ input, ctx }) => {
      const result = await ctx.sessions.listFiltered(input);
      if (result.isErr()) throw result.error;
      return {
        items: [...result.value.items],
        total: result.value.total,
        hasMore: result.value.hasMore,
      };
    }),

  get: authed
    .input(z.object({ id: SessionIdSchema }))
    .output(SessionSchema)
    .query(async ({ input, ctx }) => {
      const result = await ctx.sessions.get(input.id);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  create: authed
    .input(SessionSchema.pick({ workspaceId: true, name: true }))
    .output(SessionSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sessions.create(input);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  update: authed
    .input(z.object({ id: SessionIdSchema, patch: SessionUpdateSchema }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const patch = input.patch as Parameters<typeof ctx.sessions.update>[1];
      const result = await ctx.sessions.update(input.id, patch);
      if (result.isErr()) throw result.error;
    }),

  delete: authed
    .input(z.object({ id: SessionIdSchema, confirm: z.literal(true) }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sessions.delete(input.id);
      if (result.isErr()) throw result.error;
    }),

  archive: authed
    .input(z.object({ id: SessionIdSchema }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sessions.archive(input.id);
      if (result.isErr()) throw result.error;
    }),

  restore: authed
    .input(z.object({ id: SessionIdSchema }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sessions.restore(input.id);
      if (result.isErr()) throw result.error;
    }),

  pin: authed
    .input(z.object({ id: SessionIdSchema, pinned: z.boolean() }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = input.pinned
        ? await ctx.sessions.pin(input.id)
        : await ctx.sessions.unpin(input.id);
      if (result.isErr()) throw result.error;
    }),

  star: authed
    .input(z.object({ id: SessionIdSchema, starred: z.boolean() }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = input.starred
        ? await ctx.sessions.star(input.id)
        : await ctx.sessions.unstar(input.id);
      if (result.isErr()) throw result.error;
    }),

  markRead: authed
    .input(z.object({ id: SessionIdSchema, unread: z.boolean() }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = input.unread
        ? await ctx.sessions.markUnread(input.id)
        : await ctx.sessions.markRead(input.id);
      if (result.isErr()) throw result.error;
    }),

  branch: authed
    .input(
      z.object({
        sourceId: SessionIdSchema,
        atSequence: z.number().int().nonnegative(),
        name: z.string().min(1).max(200).optional(),
      }),
    )
    .output(SessionSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sessions.branch({
        sourceId: input.sourceId,
        atSequence: input.atSequence,
        ...(input.name === undefined ? {} : { name: input.name }),
      });
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  listBranches: authed
    .input(z.object({ parentId: SessionIdSchema }))
    .output(z.array(SessionSchema))
    .query(async ({ input, ctx }) => {
      const result = await ctx.sessions.listBranches(input.parentId);
      if (result.isErr()) throw result.error;
      return [...result.value];
    }),

  setLabels: authed
    .input(z.object({ id: SessionIdSchema, labelIds: z.array(LabelIdSchema) }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sessions.setLabels(input.id, input.labelIds);
      if (result.isErr()) throw result.error;
    }),

  getLabels: authed
    .input(z.object({ id: SessionIdSchema }))
    .output(z.array(LabelIdSchema))
    .query(async ({ input, ctx }) => {
      const result = await ctx.sessions.getLabels(input.id);
      if (result.isErr()) throw result.error;
      return [...result.value];
    }),
});
