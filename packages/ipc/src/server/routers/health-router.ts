import { z } from 'zod';
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
    .query(() => ({
      version: process.env['npm_package_version'] ?? '0.0.0',
      startedAt: Date.now(),
    })),

  servicesStatus: procedure
    .input(z.void())
    .output(ServicesStatusOutput)
    .query(({ ctx }) => ctx.servicesStatus()),
});
