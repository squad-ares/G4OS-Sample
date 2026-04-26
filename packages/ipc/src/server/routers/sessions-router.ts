import {
  GlobalSearchResultSchema,
  SessionEventSchema,
  SessionFilterSchema,
  SessionSchema,
  SessionUpdateSchema,
  TurnStreamEventSchema,
  WorkspaceIdSchema,
} from '@g4os/kernel/schemas';
import type { SessionEvent, TurnStreamEvent } from '@g4os/kernel/types';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const SessionIdSchema = z.uuid();
const LabelIdSchema = z.uuid();

const SessionsListOutput = z.array(SessionSchema);

const SessionListPageSchema = z.object({
  items: z.array(SessionSchema),
  total: z.number().int().nonnegative(),
  hasMore: z.boolean(),
});

export const sessionsRouter = router({
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
    .input(
      z.object({
        id: SessionIdSchema,
        patch: SessionUpdateSchema,
      }),
    )
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

  globalSearch: authed
    .input(z.object({ workspaceId: WorkspaceIdSchema, query: z.string() }))
    .output(GlobalSearchResultSchema)
    .query(async ({ input, ctx }) => {
      const result = await ctx.sessions.globalSearch(input.workspaceId, input.query);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  sendMessage: authed
    .input(z.object({ id: SessionIdSchema, text: z.string().min(1).max(100_000) }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sessions.sendMessage(input.id, input.text);
      if (result.isErr()) throw result.error;
    }),

  runtimeStatus: authed
    .input(z.void())
    .output(
      z.object({
        available: z.boolean(),
        providers: z.array(z.string()),
      }),
    )
    .query(async ({ ctx }) => {
      const result = await ctx.sessions.runtimeStatus();
      if (result.isErr()) throw result.error;
      return { available: result.value.available, providers: [...result.value.providers] };
    }),

  stopTurn: authed
    .input(z.object({ id: SessionIdSchema }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sessions.stopTurn(input.id);
      if (result.isErr()) throw result.error;
    }),

  respondPermission: authed
    .input(
      z.object({
        requestId: z.uuid(),
        decision: z.enum(['allow_once', 'allow_session', 'allow_always', 'deny']),
      }),
    )
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sessions.respondPermission(input.requestId, input.decision);
      if (result.isErr()) throw result.error;
    }),

  retryLastTurn: authed
    .input(z.object({ id: SessionIdSchema }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sessions.retryLastTurn(input.id);
      if (result.isErr()) throw result.error;
    }),

  truncateAfter: authed
    .input(
      z.object({
        id: SessionIdSchema,
        afterSequence: z.number().int().min(-1),
        confirm: z.literal(true),
      }),
    )
    .output(z.object({ removed: z.number().int().nonnegative() }))
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.sessions.truncateAfter(input.id, input.afterSequence);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  /**
   * Subscription de streaming usando o padrão async-generator (tRPC v11).
   * Backpressure é aplicado via uma fila limitada de eventos; a espera
   * consciente do signal resolve quando um novo evento chega OU o
   * cliente desconecta.
   */
  stream: authed.input(z.object({ sessionId: SessionIdSchema })).subscription(async function* ({
    input,
    ctx,
    signal,
  }) {
    const queue: SessionEvent[] = [];
    let notify: (() => void) | null = null;

    const disposable = ctx.sessions.subscribe(input.sessionId, (event) => {
      queue.push(event);
      notify?.();
    });

    try {
      while (!signal?.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve;
            signal?.addEventListener('abort', () => resolve(), { once: true });
          });
          notify = null;
        }
        while (queue.length > 0) {
          const next = queue.shift();
          if (next !== undefined) yield next;
        }
      }
    } finally {
      disposable.dispose();
    }
  }),

  /**
   * Subscription de eventos transientes de turn (text chunks, thinking chunks,
   * done, error). Usada pelo renderer para mostrar texto em tempo real antes
   * da mensagem ser persistida.
   */
  turnStream: authed.input(z.object({ sessionId: SessionIdSchema })).subscription(async function* ({
    input,
    ctx,
    signal,
  }) {
    const queue: TurnStreamEvent[] = [];
    let notify: (() => void) | null = null;

    const disposable = ctx.sessions.subscribeStream(input.sessionId, (event) => {
      queue.push(event);
      notify?.();
    });

    try {
      while (!signal?.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            notify = resolve;
            signal?.addEventListener('abort', () => resolve(), { once: true });
          });
          notify = null;
        }
        while (queue.length > 0) {
          const next = queue.shift();
          if (next !== undefined) yield next;
        }
      }
    } finally {
      disposable.dispose();
    }
  }),
});

export { SessionEventSchema, TurnStreamEventSchema };
