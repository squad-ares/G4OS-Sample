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

const MigrationStepReportSchema = z.object({
  kind: MigrationStepKindSchema,
  itemsMigrated: z.number().int().nonnegative(),
  itemsSkipped: z.number().int().nonnegative(),
  bytesProcessed: z.number().int().nonnegative(),
  nonFatalWarnings: z.array(z.string()).readonly(),
});

const MigrationReportSchema = z.object({
  source: z.string(),
  target: z.string(),
  v1Version: z.string().nullable(),
  startedAt: z.number().int().nonnegative(),
  finishedAt: z.number().int().nonnegative(),
  stepResults: z.array(MigrationStepReportSchema).readonly(),
  backupPath: z.string().nullable(),
  success: z.boolean(),
});

const MigrationExecuteInputSchema = z.object({
  source: V1InstallSchema.optional(),
  target: z.string().optional(),
  dryRun: z.boolean().optional(),
  force: z.boolean().optional(),
  // Master key V1 (PBKDF2) — necessário só se V1 tem credentials.enc.
  // Renderer NUNCA deve persistir; UI pede quando necessário.
  v1MasterKey: z.string().optional(),
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
      // CR-18 F-I1: `throw new Error(result.error.message)` strippava o
      // typed `AppError` (perde `code`/`context`/`cause`). `errorFormatter`
      // em `trpc-base.ts` depende de `cause instanceof AppError` para
      // anexar `appError.toJSON()`+`errorType`. Throwar `result.error`
      // direto preserva identidade no renderer (ADR-0020).
      if (result.isErr()) throw result.error;
      return result.value;
    }),

  execute: authed
    .input(MigrationExecuteInputSchema)
    .output(MigrationReportSchema)
    .mutation(async ({ ctx, input }) => {
      // exactOptionalPropertyTypes: filtra undefined explícito antes de
      // chamar; passar `{key: undefined}` quebra contrato {key?: T}.
      const result = await ctx.migration.execute({
        ...(input.source ? { source: input.source } : {}),
        ...(input.target ? { target: input.target } : {}),
        ...(input.dryRun === undefined ? {} : { dryRun: input.dryRun }),
        ...(input.force === undefined ? {} : { force: input.force }),
        ...(input.v1MasterKey ? { v1MasterKey: input.v1MasterKey } : {}),
      });
      // CR-18 F-I1: `throw new Error(result.error.message)` strippava o
      // typed `AppError` (perde `code`/`context`/`cause`). `errorFormatter`
      // em `trpc-base.ts` depende de `cause instanceof AppError` para
      // anexar `appError.toJSON()`+`errorType`. Throwar `result.error`
      // direto preserva identidade no renderer (ADR-0020).
      if (result.isErr()) throw result.error;
      return result.value;
    }),
});
