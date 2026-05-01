import { z } from 'zod';
import { procedure, router } from '../trpc.ts';

const RuntimeIntegrityFailureSchema = z.object({
  code: z.string(),
  runtime: z.string().optional(),
  path: z.string().optional(),
  expected: z.string().optional(),
  actual: z.string().optional(),
});

const RuntimeIntegrityReportSchema = z.object({
  ok: z.boolean(),
  metaPresent: z.boolean(),
  metaPath: z.string().optional(),
  appVersion: z.string().optional(),
  flavor: z.string().optional(),
  target: z.string().optional(),
  builtAt: z.string().optional(),
  failures: z.array(RuntimeIntegrityFailureSchema),
  checkedRuntimes: z.number(),
});

/**
 * Router de preferences globais.
 *
 * Atualmente expõe só `debug.hud.enabled`. Cresce conforme novas
 * preferences globais aparecem. Persistência em
 * `<appPaths.config>/preferences.json` (PreferencesStore no main).
 */
export const preferencesRouter = router({
  getDebugHudEnabled: procedure
    .input(z.void())
    .output(z.boolean())
    .query(async ({ ctx }) => {
      const result = await ctx.preferences.getDebugHudEnabled();
      // CR-18 F-I3: throw `result.error` direto preserva `AppError`
      // (errorFormatter em trpc-base.ts anexa toJSON()+errorType). Antes
      // era `new TRPCError({code:'INTERNAL_SERVER_ERROR', message})` que
      // strippava `code`/`context`/`cause` — renderer recebia genérico.
      if (result.isErr()) throw result.error;
      return result.value;
    }),
  setDebugHudEnabled: procedure
    .input(z.object({ enabled: z.boolean() }))
    .output(z.void())
    .mutation(async ({ input, ctx }) => {
      const result = await ctx.preferences.setDebugHudEnabled(input.enabled);
      // CR-18 F-I3: throw `result.error` direto preserva `AppError`
      // (errorFormatter em trpc-base.ts anexa toJSON()+errorType). Antes
      // era `new TRPCError({code:'INTERNAL_SERVER_ERROR', message})` que
      // strippava `code`/`context`/`cause` — renderer recebia genérico.
      if (result.isErr()) throw result.error;
    }),
  verifyRuntimeIntegrity: procedure
    .input(z.void())
    .output(RuntimeIntegrityReportSchema)
    .mutation(async ({ ctx }) => {
      const result = await ctx.preferences.verifyRuntimeIntegrity();
      // CR-18 F-I3: throw `result.error` direto preserva `AppError`
      // (errorFormatter em trpc-base.ts anexa toJSON()+errorType). Antes
      // era `new TRPCError({code:'INTERNAL_SERVER_ERROR', message})` que
      // strippava `code`/`context`/`cause` — renderer recebia genérico.
      if (result.isErr()) throw result.error;
      // Spread `failures` para soltar `readonly` exigido por Zod output.
      return { ...result.value, failures: [...result.value.failures] };
    }),
});
