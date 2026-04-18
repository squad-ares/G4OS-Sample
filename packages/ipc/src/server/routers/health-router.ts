import { z } from 'zod';
import { procedure, router } from '../trpc.ts';

const HealthPingOutput = z.literal('ok');

const HealthVersionOutput = z.object({
  version: z.string(),
  startedAt: z.number().int().positive(),
});

export const healthRouter = router({
  ping: procedure.output(HealthPingOutput).query(() => 'ok' as const),

  version: procedure.output(HealthVersionOutput).query(() => ({
    version: process.env['npm_package_version'] ?? '0.0.0',
    startedAt: Date.now(),
  })),
});
