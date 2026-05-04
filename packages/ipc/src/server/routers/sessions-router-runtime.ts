/**
 * Sessions router — operações de runtime (turn execution + busca global).
 * sendMessage, stopTurn, respondPermission, retry/truncate, runtimeStatus,
 * globalSearch.
 */

import { ErrorCode } from '@g4os/kernel/errors';
import { GlobalSearchResultSchema, SessionIdSchema, WorkspaceIdSchema } from '@g4os/kernel/schemas';
import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import { router } from '../trpc.ts';

export const sessionsRuntimeRouter = router({
  // 30 buscas por minuto — FTS5 em sessões grandes pode ser lento.
  globalSearch: authed
    .use(rateLimit({ windowMs: 60_000, max: 30 }))
    // Cap em query — buscas reais ficam bem abaixo de 8000 chars,
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
        // Cap defensivo. Provider slugs reais (`anthropic-direct`,
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
      // F-CR46-9: `interrupt()` retorna SESSION_NOT_FOUND quando não há turn
      // ativo — race entre done event chegando ao renderer e clique do user.
      // Tratado como benign no-op aqui: o turn já terminou, nada a fazer.
      if (result.isErr() && result.error.code !== ErrorCode.SESSION_NOT_FOUND) {
        throw result.error;
      }
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
