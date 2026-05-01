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

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, open, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import { MIGRATION_DONE_MARKER } from './plan.ts';
import type { StepOptions, StepRunner } from './steps/contract.ts';
import { migrateConfig } from './steps/migrate-config.ts';
import { migrateCredentials } from './steps/migrate-credentials.ts';
import { migrateSessions } from './steps/migrate-sessions.ts';
import { migrateSkills } from './steps/migrate-skills.ts';
import { migrateSources } from './steps/migrate-sources.ts';
import { migrateWorkspaces } from './steps/migrate-workspaces.ts';
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
  /**
   * Dependências externas dos steps (vault, masterKey, workspace writer).
   * Steps que precisam e não recebem retornam err — caller decide.
   */
  readonly stepOptions?: StepOptions;
}

const MIGRATION_LOCK_FILE = '.migration.lock';

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

  // CR-18 F-M2: lockfile + re-check do marker DENTRO do execute. O plan
  // acima é um snapshot — entre `createMigrationPlan()` e `execute()` outra
  // instância pode ter rodado completa. Sem essas duas guards, dois CLIs/
  // wizards rodando em paralelo escrevem por cima.
  let lockHandle: Awaited<ReturnType<typeof open>> | null = null;
  if (!options.dryRun) {
    await mkdir(plan.target, { recursive: true });
    const lockPath = join(plan.target, MIGRATION_LOCK_FILE);
    try {
      // `wx` flag = O_EXCL — falha se arquivo existir. Atomic.
      lockHandle = await open(lockPath, 'wx');
      await lockHandle.write(`pid=${process.pid}\nstartedAt=${startedAt}\n`);
    } catch (cause) {
      const lockError = cause as NodeJS.ErrnoException;
      return err(
        new AppError({
          code: ErrorCode.UNKNOWN_ERROR,
          message:
            lockError.code === 'EEXIST'
              ? `migration já em curso (lock ${lockPath} presente — outro processo rodando ou crash anterior; remova manualmente se for o caso)`
              : `falha ao adquirir lock ${lockPath}: ${lockError.message}`,
          cause: lockError,
        }),
      );
    }
    // Re-check do marker após adquirir lock. Race: A fez plan
    // (alreadyMigrated=false), B fez plan (false), B executou completo,
    // A pega lock e marker já existe. Sem este check, A roda steps por
    // cima do estado de B.
    if (!options.force && existsSync(join(plan.target, MIGRATION_DONE_MARKER))) {
      await releaseLock(lockHandle, plan.target);
      return err(
        new AppError({
          code: ErrorCode.UNKNOWN_ERROR,
          message:
            'V2 já migrado por outra invocação enquanto este plan estava no ar. Use --force se quiser re-migrar.',
        }),
      );
    }
  }

  // Backup do V1 antes de tocar qualquer coisa. Em dry-run pulamos; o
  // step nem grava nada no V2 mesmo, então não há rollback a fazer.
  let backupPath: string | null = null;
  if (!options.dryRun) {
    const backup = await createBackup(plan.source.path);
    if (backup.isErr()) {
      await releaseLock(lockHandle, plan.target);
      return err(backup.error);
    }
    backupPath = backup.value;
  }

  // Rastreia paths que steps + executor escreveram diretamente em
  // `plan.target`. Rollback remove SÓ esses caminhos — nunca `rm -rf`
  // no target completo (CR-18 F-M1 + F-DT-D).
  const writtenPaths: string[] = [];
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
      await releaseLock(lockHandle, plan.target);
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
      options: options.stepOptions ?? {},
    });

    if (stepResult.isErr()) {
      if (!options.dryRun) {
        await rollbackPaths(writtenPaths).catch(() => {
          // best-effort — backup V1 ainda existe.
        });
      }
      await releaseLock(lockHandle, plan.target);
      return err(stepResult.error);
    }

    stepResults.push({ kind: step.kind, ...stepResult.value });
    if (stepResult.value.writtenPaths) {
      writtenPaths.push(...stepResult.value.writtenPaths);
    }
  }

  // CR-18 F-M3: detecta falha total silenciosa antes de escrever o
  // MIGRATION_DONE_MARKER. Step retornar `ok` com `migrated=0` &&
  // `skipped=found` && N>0 indica que cada item bateu erro recoverable
  // (cred com nome inválido, workspace conflict, etc.) — escrever marker
  // sinaliza "feito" para o próximo run e bloqueia retry sem `--force`.
  // Aqui escalamos para erro hard quando step DEVERIA ter migrado algo
  // mas não migrou nada e produziu apenas warnings.
  const totalFailed = stepResults.filter((r) => {
    const found = r.itemsMigrated + r.itemsSkipped;
    return found > 0 && r.itemsMigrated === 0 && r.itemsSkipped === found;
  });
  if (totalFailed.length > 0 && !options.dryRun) {
    await rollbackPaths(writtenPaths).catch(() => undefined);
    await releaseLock(lockHandle, plan.target);
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: `migration partially failed: ${totalFailed.length} step(s) had 0 migrated of N items (all skipped). Steps: ${totalFailed.map((s) => s.kind).join(', ')}. Marker NOT written; review warnings and retry.`,
        context: {
          failedSteps: totalFailed.map((s) => ({
            kind: s.kind,
            warnings: s.nonFatalWarnings,
            itemsSkipped: s.itemsSkipped,
          })),
        },
      }),
    );
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
    writtenPaths.push(markerPath);
  }

  await releaseLock(lockHandle, plan.target);

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
  // CR-18 F-M6: sufixo com `Date.now()` colidia em runs <1ms (CI matrix
  // retry rápido). Adicionamos UUID curto pra garantir unicidade.
  const backupPath = `${sourcePath}.backup-${Date.now()}-${randomUUID().slice(0, 8)}`;
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

/**
 * Remove cirurgicamente apenas paths que o executor + steps registraram
 * como `writtenPaths`. Nunca apaga o `targetPath` completo — caller pode
 * ter passado o diretório raiz da V2 (CR-18 F-DT-D), e wipe full apagaria
 * dados produtivos.
 */
async function rollbackPaths(paths: readonly string[]): Promise<void> {
  // Remove em ordem reversa pra que diretórios apareçam após seus filhos.
  for (const path of [...paths].reverse()) {
    await rm(path, { recursive: true, force: true });
  }
}

async function releaseLock(
  handle: Awaited<ReturnType<typeof open>> | null,
  targetPath: string,
): Promise<void> {
  if (!handle) return;
  try {
    await handle.close();
  } catch {
    // ignore
  }
  try {
    await rm(join(targetPath, MIGRATION_LOCK_FILE), { force: true });
  } catch {
    // ignore — lock fica no disco mas próximo run avisa o usuário com
    // mensagem clara de "remova manualmente".
  }
}
