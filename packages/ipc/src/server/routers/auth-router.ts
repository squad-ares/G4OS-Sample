import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { procedure, router } from '../trpc.ts';

const IpcSessionSchema = z.object({
  userId: z.string(),
  email: z.email(),
  expiresAt: z.number().int().positive().optional(),
});

const ManagedLoginRequiredEventSchema = z.object({
  reason: z.string(),
});

export const authRouter = router({
  getMe: authed
    .input(z.void())
    .output(IpcSessionSchema)
    .query(async ({ ctx }) => {
      const result = await ctx.auth.getMe();
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  sendOtp: procedure
    .input(z.object({ email: z.email() }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.auth.sendOtp(input.email);
      if (result.isErr()) throw result.error;
    }),

  verifyOtp: procedure
    .input(z.object({ email: z.email(), code: z.string().min(4).max(10) }))
    .output(IpcSessionSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.auth.verifyOtp(input.email, input.code);
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  signOut: authed
    .input(z.void())
    .output(z.void())
    .mutation(async ({ ctx }) => {
      const result = await ctx.auth.signOut();
      if (result.isErr()) throw result.error;
    }),

  /**
   * Reset destrutivo. Aceita só com confirmação explícita no input para
   * evitar invocação acidental. Não exige `authed` — pode rodar em estado
   * `unauthenticated` (ex.: sessão expirou e usuário quer resetar antes de
   * tentar logar de novo).
   */
  wipeAndReset: procedure
    .input(z.object({ confirm: z.literal(true) }))
    .output(z.void())
    .mutation(async ({ ctx }) => {
      const result = await ctx.auth.wipeAndReset();
      if (result.isErr()) throw result.error;
    }),

  /**
   * Subscription async-generator (tRPC v11) para eventos de re-auth pedidos
   * pelo backend. Renderer subscreve no app shell e mostra toast/redirect
   * quando recebe.
   */
  managedLoginRequired: procedure.input(z.void()).subscription(async function* ({ ctx, signal }) {
    const queue: { reason: string }[] = [];
    let notify: (() => void) | null = null;

    const disposable = ctx.auth.subscribeManagedLoginRequired((event) => {
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
          if (next !== undefined) yield ManagedLoginRequiredEventSchema.parse(next);
        }
      }
    } finally {
      disposable.dispose();
    }
  }),
});
