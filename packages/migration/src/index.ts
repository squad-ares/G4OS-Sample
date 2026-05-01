/**
 * `@g4os/migration` — V1 → V2 data migration tool.
 *
 * Public surface:
 *   - `detectV1Install(home?)` — encontra install V1 em `homedir()`.
 *   - `createMigrationPlan({source, target})` — gera blueprint sem tocar V2.
 *   - `execute(plan, options)` — backup + run steps + rollback em falha.
 *   - Types: `V1Install`, `MigrationPlan`, `MigrationReport`, `MigrationStep`.
 *
 * CLI entry vive em `scripts/migrate-v1.ts` no root do monorepo (ver
 * `pnpm migrate:v1`). Main process consome via service thin wrapper
 * (UI Wizard é entrega separada — ver `docs/ga-gates.md` Gate D).
 */

export { type ExecuteOptions, execute } from './executor.ts';
export { type CreatePlanInput, createMigrationPlan, MIGRATION_DONE_MARKER } from './plan.ts';
export type {
  StepContext,
  StepOptions,
  StepResult,
  StepRunner,
  V2SessionMetadata,
  V2SessionWriter,
  V2SourceInput,
  V2SourceWriter,
  V2WorkspaceInput,
  V2WorkspaceWriter,
} from './steps/contract.ts';
export {
  type MigrationError,
  type MigrationErrorCode,
  type MigrationPlan,
  type MigrationReport,
  type MigrationStep,
  type MigrationStepKind,
  type ProgressCallback,
  type ProgressEvent,
  V1_CANDIDATE_DIRS,
  type V1Flavor,
  type V1Install,
} from './types.ts';
export { detectV1Install } from './v1-detector.ts';
