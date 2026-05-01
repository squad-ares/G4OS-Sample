/**
 * Step `skills` — copia `<v1>/skills/` para `<v2>/skills-legacy/` em
 * formato preservado. Feature de skills V2 (11-features/10-skills-workflows)
 * ainda não foi implementada; quando subir, ela importa desse diretório.
 *
 * Decisão consciente: NÃO converter agora. V1 → V2 schema de skill ainda
 * não é estável (depende do design da feature V2). Cópia byte-a-byte
 * preserva o conteúdo do user pra re-importar quando a feature subir.
 *
 * Idempotente: se `<v2>/skills-legacy/` já existe, skipa com warning
 * (assume que migração anterior já fez a cópia).
 */

import { existsSync } from 'node:fs';
import { cp, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import type { StepContext, StepResult } from './contract.ts';

const LEGACY_DIR_NAME = 'skills-legacy';

export async function migrateSkills(ctx: StepContext): Promise<Result<StepResult, AppError>> {
  const { sourcePath, targetPath, stepIndex, stepCount, onProgress, dryRun } = ctx;
  const v1SkillsDir = join(sourcePath, 'skills');

  if (!existsSync(v1SkillsDir)) {
    onProgress({
      stepKind: 'skills',
      stepIndex,
      stepCount,
      stepProgress: 1,
      message: 'skills: V1 sem diretório skills/ — skip',
    });
    return ok(emptyResult());
  }

  let entries: string[];
  try {
    const dirents = await readdir(v1SkillsDir, { withFileTypes: true });
    entries = dirents.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (cause) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: `migrate-skills: falha lendo ${v1SkillsDir}`,
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }

  if (entries.length === 0) {
    onProgress({
      stepKind: 'skills',
      stepIndex,
      stepCount,
      stepProgress: 1,
      message: 'skills: 0 skills em V1',
    });
    return ok(emptyResult());
  }

  const warnings: string[] = [
    'skills V2 ainda não disponível (11-features/10) — copiados pra `skills-legacy/`. Re-importar quando feature subir.',
  ];

  const targetDir = join(targetPath, LEGACY_DIR_NAME);
  const bytes = await dirSize(v1SkillsDir);

  if (existsSync(targetDir)) {
    warnings.push(
      `${LEGACY_DIR_NAME}/ já existe em V2 — skip cópia (assumindo migração anterior já copiou)`,
    );
    onProgress({
      stepKind: 'skills',
      stepIndex,
      stepCount,
      stepProgress: 1,
      message: 'skills: skills-legacy/ já presente',
    });
    return ok({
      itemsMigrated: 0,
      itemsSkipped: entries.length,
      bytesProcessed: bytes,
      nonFatalWarnings: warnings,
    });
  }

  if (dryRun) {
    onProgress({
      stepKind: 'skills',
      stepIndex,
      stepCount,
      stepProgress: 1,
      message: `skills: dry-run (${entries.length} skills, ${bytes} bytes)`,
    });
    return ok({
      itemsMigrated: entries.length,
      itemsSkipped: 0,
      bytesProcessed: bytes,
      nonFatalWarnings: warnings,
    });
  }

  try {
    await cp(v1SkillsDir, targetDir, { recursive: true });
  } catch (cause) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: `migrate-skills: cp ${v1SkillsDir} → ${targetDir} falhou`,
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }

  onProgress({
    stepKind: 'skills',
    stepIndex,
    stepCount,
    stepProgress: 1,
    message: `skills: ${entries.length} copiadas pra skills-legacy/`,
  });

  return ok({
    itemsMigrated: entries.length,
    itemsSkipped: 0,
    bytesProcessed: bytes,
    nonFatalWarnings: warnings,
    writtenPaths: [targetDir],
  });
}

function emptyResult(): StepResult {
  return { itemsMigrated: 0, itemsSkipped: 0, bytesProcessed: 0, nonFatalWarnings: [] };
}

async function dirSize(path: string): Promise<number> {
  let total = 0;
  try {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const sub = join(path, entry.name);
      if (entry.isDirectory()) {
        total += await dirSize(sub);
      } else if (entry.isFile()) {
        try {
          const s = await stat(sub);
          total += s.size;
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // dir inacessível
  }
  return total;
}
