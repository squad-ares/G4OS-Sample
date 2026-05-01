import { z } from 'zod';
import { authed } from '../middleware/authed.ts';
import { router } from '../trpc.ts';

const V1FlavorSchema = z.enum(['internal', 'public']);

const V1InstallSchema = z.object({
  path: z.string().min(1),
  version: z.string().nullable(),
  flavor: V1FlavorSchema,
});

const MigrationStepKindSchema = z.enum([
  'config',
  'credentials',
  'workspaces',
  'sessions',
  'sources',
  'skills',
]);

const MigrationStepSchema = z.object({
  kind: MigrationStepKindSchema,
  description: z.string(),
  count: z.number().int().nonnegative(),
  estimatedBytes: z.number().int().nonnegative(),
});

const MigrationPlanSchema = z.object({
  source: V1InstallSchema,
  target: z.string(),
  steps: z.array(MigrationStepSchema).readonly(),
  estimatedSize: z.number().int().nonnegative(),
  warnings: z.array(z.string()).readonly(),
  alreadyMigrated: z.boolean(),
});

const MigrationPlanInputSchema = z.object({
  source: V1InstallSchema.optional(),
  target: z.string().optional(),
});

export const migrationRouter = router({
  detect: authed.output(V1InstallSchema.nullable()).query(async ({ ctx }) => {
    const result = await ctx.migration.detect();
    if (result.isErr()) throw new Error(result.error.message);
    return result.value;
  }),

  plan: authed
    .input(MigrationPlanInputSchema)
    .output(MigrationPlanSchema)
    .query(async ({ ctx, input }) => {
      const result = await ctx.migration.plan({
        ...(input.source ? { source: input.source } : {}),
        ...(input.target ? { target: input.target } : {}),
      });
      if (result.isErr()) throw new Error(result.error.message);
      return result.value;
    }),
});

export type MigrationRouter = typeof migrationRouter;
