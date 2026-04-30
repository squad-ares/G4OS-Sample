/**
 * Step `credentials` — delega ao migrator existente em
 * `@g4os/credentials/migration`. Esse pacote já lê `credentials.enc`
 * AES-GCM, sanitiza chaves, detecta colisões, é idempotente e tolera
 * falha por entrada (todas as garantias documentadas em ADR-0052).
 *
 * Aqui só fazemos o wire: validar pré-requisitos (vault + masterKey),
 * apontar pro V1 path, e converter `MigrationReport` → `StepResult`.
 *
 * Sem `vault` ou `v1MasterKey` em `ctx.options`, retornamos `Result.err`
 * com mensagem explícita — caller (CLI ou wizard) decide como pedir
 * essas dependências.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { migrateV1ToV2 } from '@g4os/credentials/migration';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import type { StepContext, StepResult } from './contract.ts';

export async function migrateCredentials(ctx: StepContext): Promise<Result<StepResult, AppError>> {
  const { sourcePath, stepIndex, stepCount, onProgress, dryRun, options } = ctx;
  const v1CredPath = join(sourcePath, 'credentials.enc');

  if (!existsSync(v1CredPath)) {
    onProgress({
      stepKind: 'credentials',
      stepIndex,
      stepCount,
      stepProgress: 1,
      message: 'credentials: V1 sem credentials.enc — skip',
    });
    return ok(emptyResult());
  }

  if (!options.vault) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message:
          'migrate-credentials: requer `vault` em StepOptions (createVault({ mode })). CLI sem vault deve usar --steps sem `credentials`.',
      }),
    );
  }
  if (!options.v1MasterKey) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message:
          'migrate-credentials: requer `v1MasterKey` em StepOptions (PBKDF2 do V1). Forneça via --v1-master-key ou prompt.',
      }),
    );
  }

  onProgress({
    stepKind: 'credentials',
    stepIndex,
    stepCount,
    stepProgress: 0,
    message: dryRun ? 'credentials: dry-run, lendo V1' : 'credentials: migrando',
  });

  const report = await migrateV1ToV2({
    vault: options.vault,
    masterKey: options.v1MasterKey,
    v1Path: v1CredPath,
    dryRun,
  });

  onProgress({
    stepKind: 'credentials',
    stepIndex,
    stepCount,
    stepProgress: 1,
    message: `credentials: ${report.migrated} migradas, ${report.skipped} skip, ${report.failed} falhas`,
  });

  // `report.errors` são por-entrada — não-fatal. Exposing como warnings.
  // Se ZERO migrated mas TODAS falharam, sinalizamos como step error
  // (provavelmente masterKey errada ou arquivo corrompido).
  if (report.found > 0 && report.migrated === 0 && report.failed === report.found) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: `migrate-credentials: TODAS as ${report.found} credenciais falharam. masterKey errada? Erros: ${report.errors.slice(0, 3).join('; ')}`,
      }),
    );
  }

  return ok({
    itemsMigrated: report.migrated,
    itemsSkipped: report.skipped,
    bytesProcessed: 0, // tamanho não é o que importa em creds; report.found é mais útil
    nonFatalWarnings: report.errors,
  });
}

function emptyResult(): StepResult {
  return { itemsMigrated: 0, itemsSkipped: 0, bytesProcessed: 0, nonFatalWarnings: [] };
}
