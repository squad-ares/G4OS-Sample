/**
 * Contrato de step de migração — cada step recebe paths source/target +
 * progress callback e retorna stats de execução.
 *
 * Mantemos contrato puro (sem dependência de Electron, SDK, etc.) pra
 * que steps possam ser testados isoladamente com tmpdir + fixtures.
 */

import type { AppError } from '@g4os/kernel/errors';
import type { Result } from 'neverthrow';
import type { MigrationStep, ProgressCallback } from '../types.ts';

export interface StepContext {
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly step: MigrationStep;
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly onProgress: ProgressCallback;
  readonly dryRun: boolean;
}

export interface StepResult {
  readonly itemsMigrated: number;
  readonly itemsSkipped: number;
  readonly bytesProcessed: number;
  readonly nonFatalWarnings: readonly string[];
}

export type StepRunner = (ctx: StepContext) => Promise<Result<StepResult, AppError>>;
