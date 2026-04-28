/**
 * Sessions router — operações de runtime (turn execution + busca global).
 * sendMessage, stopTurn, respondPermission, retry/truncate, runtimeStatus,
 * globalSearch.
 */

import { GlobalSearchResultSchema, SessionIdSchema, WorkspaceIdSchema } from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

export const sessionsRuntimeRouter = router({
  globalSearch: authed
    // CR9: cap em query — buscas reais ficam bem abaixo de 8000 chars,
    // mas sem `.max()` um caller hostil/buggy podia mandar payload de
    // MB e travar o FTS engine.
    .input(z.object({ workspaceId: WorkspaceIdSchema, query: z.string().max(8000) }))
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
        // CR9: cap defensivo. Provider slugs reais (`anthropic-direct`,
        // `bedrock-claude-3-5-sonnet-latest`) ficam <64 chars; lista total
        // <100. Cap protege contra serialização patológica.
        providers: z.array(z.string().max(128)).max(100),
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
});
