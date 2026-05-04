/**
 * Step `skills` — copia `<v1>/skills/` para `<v2>/skills-legacy/` em
 * formato preservado. Feature de skills V2 (11-features/10-skills-workflows)
 * ainda não foi implementada; quando subir, ela importa desse diretório.
 *
 * Decisão consciente: NÃO converter agora. V1 → V2 schema de skill ainda
 * não é estável (depende do design da feature V2). Cópia byte-a-byte
 * preserva o conteúdo do user pra re-importar quando a feature subir.
 *
 * F-CR40-8: Idempotência por-entry — itera cada skill individualmente e
 * verifica se `<v2>/skills-legacy/<entry>/` já existe antes de copiar.
 * Evita o bug onde uma migração parcial anterior (cp falhou no meio)
 * criava o diretório raiz `skills-legacy/` mas deixava entries faltando;
 * próximas execuções skipavam tudo silenciosamente. `writtenPaths` é
 * populado por entry (rollback granular).
 */

import { existsSync } from 'node:fs';
import { cp, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppError } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import { migrationError } from '../types.ts';
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
      migrationError({
        migrationCode: 'step_failed',
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

  const bytes = await dirSize(v1SkillsDir);
  const targetDir = join(targetPath, LEGACY_DIR_NAME);

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

  // F-CR40-8: itera por entry — não usa existsSync no diretório raiz como
  // sentinel de idempotência. Migração parcial anterior pode ter criado
  // skills-legacy/ com apenas metade das entries.
  let migrated = 0;
  let skipped = 0;
  const writtenPaths: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry) continue;

    onProgress({
      stepKind: 'skills',
      stepIndex,
      stepCount,
      stepProgress: i / entries.length,
      message: `skills: ${entry}`,
    });

    const srcEntry = join(v1SkillsDir, entry);
    const dstEntry = join(targetDir, entry);

    if (existsSync(dstEntry)) {
      // Entry já copiada — skip granular (idempotente por entry).
      skipped++;
      continue;
    }

    try {
      await cp(srcEntry, dstEntry, { recursive: true });
      writtenPaths.push(dstEntry);
      migrated++;
    } catch (cause) {
      return err(
        migrationError({
          migrationCode: 'step_failed',
          message: `migrate-skills: cp ${srcEntry} → ${dstEntry} falhou`,
          cause: cause instanceof Error ? cause : undefined,
        }),
      );
    }
  }

  onProgress({
    stepKind: 'skills',
    stepIndex,
    stepCount,
    stepProgress: 1,
    message: `skills: ${migrated} copiadas, ${skipped} skip`,
  });

  return ok({
    itemsMigrated: migrated,
    itemsSkipped: skipped,
    bytesProcessed: bytes,
    nonFatalWarnings: warnings,
    writtenPaths,
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
