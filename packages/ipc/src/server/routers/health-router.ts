import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { procedure, router } from '../trpc.ts';

const HealthPingOutput = z.literal('ok');

const HealthVersionOutput = z.object({
  version: z.string(),
  startedAt: z.number().int().positive(),
});

const ServiceStatusOutput = z.object({
  configured: z.boolean(),
  reachable: z.boolean().nullable(),
  latencyMs: z.number().nullable(),
  error: z.string().nullable(),
  endpoint: z.string().nullable(),
});

const ServicesStatusOutput = z.object({
  sentry: ServiceStatusOutput,
  otel: ServiceStatusOutput,
  metricsServer: ServiceStatusOutput,
});

export const healthRouter = router({
  ping: procedure
    .input(z.void())
    .output(HealthPingOutput)
    .query(() => 'ok' as const),

  version: procedure
    .input(z.void())
    .output(HealthVersionOutput)
    .query(({ ctx }) => ({
      // `getAppInfo` usa `app.getVersion()` no main process (Electron), que
      // retorna a versão correta mesmo no binário empacotado.
      // `npm_package_version` só está disponível via `pnpm run` e é undefined
      // em produção (ADR-0013 — noProcessEnv).
      version: ctx.platform?.getAppInfo?.()?.version ?? '0.0.0',
      startedAt: Date.now(),
    })),

  // servicesStatus expõe latência de endpoints internos — restringir a authed
  // para não vazar topologia de observability para callers pré-auth (F-CR38-10).
  servicesStatus: authed
    .input(z.void())
    .output(ServicesStatusOutput)
    .query(({ ctx }) => ctx.servicesStatus()),
});
