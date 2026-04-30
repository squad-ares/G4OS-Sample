/**
 * Executor — orquestra os steps do plan, faz backup do V1 antes, roda
 * cada step em sequência, e em caso de falha tenta rollback do V2.
 *
 * Contrato:
 *   - `execute(plan)` retorna `Result<MigrationReport, AppError>`.
 *   - Pre-step: cria `<v1>.backup-<ts>` via cp recursivo. Se falhar, aborta.
 *   - Cada step recebe paths + progress callback + dryRun flag.
 *   - Erro fatal num step: tenta `rollback(target)` removendo V2 escrito até
 *     ali; backup do V1 NÃO é tocado (idempotente do lado V1).
 *   - Sucesso: escreve `<v2>/.migration-done` marker (impede re-run sem --force).
 *
 * Backup do V1 é mantido por padrão — usuário deleta manualmente após
 * verificar V2. Excluímos a possibilidade de "auto-delete on success" pra
 * evitar perda de dados em incidentes silenciosos pós-migração.
 */

import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import { MIGRATION_DONE_MARKER } from './plan.ts';
import type { StepRunner } from './steps/contract.ts';
import { migrateConfig } from './steps/migrate-config.ts';
import {
  migrateCredentials,
  migrateSessions,
  migrateSkills,
  migrateSources,
  migrateWorkspaces,
} from './steps/stubs.ts';
import type {
  MigrationPlan,
  MigrationReport,
  MigrationStepKind,
  ProgressCallback,
} from './types.ts';

const STEP_RUNNERS: Record<MigrationStepKind, StepRunner> = {
  config: migrateConfig,
  credentials: migrateCredentials,
  workspaces: migrateWorkspaces,
  sessions: migrateSessions,
  sources: migrateSources,
  skills: migrateSkills,
};

export interface ExecuteOptions {
  readonly dryRun: boolean;
  /** Force re-run mesmo com `.migration-done` presente. */
  readonly force: boolean;
  /** Callback invocado a cada progresso de step. */
  readonly onProgress: ProgressCallback;
  /**
   * Subset de steps a executar. Se `undefined`, roda todos do plan.
   * Útil pra retry parcial após falha.
   */
  readonly stepFilter?: ReadonlySet<MigrationStepKind>;
}

export async function execute(
  plan: MigrationPlan,
  options: ExecuteOptions,
): Promise<Result<MigrationReport, AppError>> {
  const startedAt = Date.now();

  if (plan.alreadyMigrated && !options.force) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: 'V2 já migrado (.migration-done presente). Use --force para re-migrar.',
      }),
    );
  }

  // Backup do V1 antes de tocar qualquer coisa. Em dry-run pulamos; o
  // step nem grava nada no V2 mesmo, então rollback é trivial (rm -rf).
  let backupPath: string | null = null;
  if (!options.dryRun) {
    const backup = await createBackup(plan.source.path);
    if (backup.isErr()) return err(backup.error);
    backupPath = backup.value;
  }

  const stepResults: MigrationReport['stepResults'][number][] = [];
  const stepsToRun = options.stepFilter
    ? plan.steps.filter((s) => options.stepFilter?.has(s.kind))
    : plan.steps;
  const totalSteps = stepsToRun.length;

  for (let i = 0; i < stepsToRun.length; i++) {
    const step = stepsToRun[i];
    if (!step) continue;
    const runner = STEP_RUNNERS[step.kind];
    if (!runner) {
      return err(
        new AppError({
          code: ErrorCode.UNKNOWN_ERROR,
          message: `executor: nenhum runner para step kind="${step.kind}"`,
        }),
      );
    }

    const stepResult = await runner({
      sourcePath: plan.source.path,
      targetPath: plan.target,
      step,
      stepIndex: i,
      stepCount: totalSteps,
      onProgress: options.onProgress,
      dryRun: options.dryRun,
    });

    if (stepResult.isErr()) {
      // Rollback best-effort. Backup do V1 fica preservado pra recovery manual.
      if (!options.dryRun) {
        await rollbackTarget(plan.target).catch(() => {
          // ignore — backup ainda existe; user pode restaurar V1 manualmente.
        });
      }
      return err(stepResult.error);
    }

    stepResults.push({ kind: step.kind, ...stepResult.value });
  }

  // Marker de idempotência pra próximo run reconhecer estado migrado.
  if (!options.dryRun) {
    const markerPath = join(plan.target, MIGRATION_DONE_MARKER);
    await mkdir(dirname(markerPath), { recursive: true });
    await writeFile(
      markerPath,
      JSON.stringify({
        version: plan.source.version,
        finishedAt: Date.now(),
      }),
      'utf-8',
    );
  }

  return ok({
    source: plan.source.path,
    target: plan.target,
    v1Version: plan.source.version,
    startedAt,
    finishedAt: Date.now(),
    stepResults,
    backupPath,
    success: true,
  });
}

async function createBackup(sourcePath: string): Promise<Result<string, AppError>> {
  const backupPath = `${sourcePath}.backup-${Date.now()}`;
  try {
    await cp(sourcePath, backupPath, { recursive: true });
    return ok(backupPath);
  } catch (cause) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: `backup do V1 falhou: ${sourcePath} → ${backupPath}`,
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }
}

async function rollbackTarget(targetPath: string): Promise<void> {
  // Remove V2 parcialmente escrito. Backup V1 fica intacto — user pode
  // restaurar manualmente caso queira retentar do zero.
  await rm(targetPath, { recursive: true, force: true });
}
