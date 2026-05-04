import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

/**
 * Schema mínimo enquanto o domínio de "agent listing" não materializa.
 * Antes era `z.unknown()` — viola política de output explícito (CLAUDE.md
 * "tipos > comentários"). Esta shape é o piso: id estável + label visível
 * para UI. Estender quando a feature pedir provider/status/etc.
 */
const AgentListItemSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
  })
  .passthrough();

export const agentsRouter = router({
  list: authed
    .input(z.void())
    .output(z.array(AgentListItemSchema).readonly())
    .query(async ({ ctx }) => {
      const result = await ctx.agents.list();
      if (result.isErr()) throw result.error;
      // Service contract atual retorna `readonly unknown[]` — Zod parse
      // valida shape mínima e descarta entries sem id/name. Service real
      // (TASK futuro) deve apertar o tipo do retorno pra eliminar o cast.
      return [...result.value]
        .map((item) => AgentListItemSchema.safeParse(item))
        .flatMap((r) => (r.success ? [r.data] : []));
    }),
});
