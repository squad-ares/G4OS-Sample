/**
 * Step `config` — copia `config.json` do V1 pra V2 mapeando os campos
 * conhecidos. Step "real" mais simples; serve de protótipo dos demais.
 *
 * V1 config (heurística, baseado em inspeção do app antigo):
 * ```json
 * { "version": "0.x.y", "theme": "dark|light", "locale": "pt-BR|en-US",
 *   "telemetryOptIn": boolean, "lastWorkspaceId": "uuid" }
 * ```
 *
 * V2 não tem um único `config.json` — preferences vivem no
 * `PreferencesStore` (per-workspace) e `app.config` é env-driven. Este
 * step grava `migration-config.json` no target, e o caller decide quais
 * fields aplicar na primeira boot pós-migração.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import type { StepContext, StepResult } from './contract.ts';

interface V1ConfigLike {
  readonly version?: unknown;
  readonly theme?: unknown;
  readonly locale?: unknown;
  readonly telemetryOptIn?: unknown;
  readonly lastWorkspaceId?: unknown;
}

export async function migrateConfig(ctx: StepContext): Promise<Result<StepResult, AppError>> {
  const { sourcePath, targetPath, stepIndex, stepCount, onProgress, dryRun } = ctx;
  onProgress({
    stepKind: 'config',
    stepIndex,
    stepCount,
    stepProgress: 0,
    message: dryRun ? 'config: dry-run' : 'config: lendo V1',
  });

  const v1ConfigPath = join(sourcePath, 'config.json');
  const warnings: string[] = [];

  let raw: string;
  try {
    raw = await readFile(v1ConfigPath, 'utf-8');
  } catch (cause) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: `migrate-config: falha lendo ${v1ConfigPath}`,
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }

  let parsed: V1ConfigLike;
  try {
    parsed = JSON.parse(raw) as V1ConfigLike;
  } catch (cause) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: 'migrate-config: V1 config.json malformado',
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }

  // Whitelist de campos conhecidos. Demais são preservados em `extras` pra
  // não perdermos info útil; caller pode inspecionar pós-migração.
  const known: Record<string, unknown> = {};
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (['version', 'theme', 'locale', 'telemetryOptIn', 'lastWorkspaceId'].includes(k)) {
      known[k] = v;
    } else {
      extras[k] = v;
    }
  }
  if (Object.keys(extras).length > 0) {
    warnings.push(
      `${Object.keys(extras).length} campo(s) desconhecido(s) em V1 config — preservados em "extras"`,
    );
  }

  const bytes = Buffer.byteLength(raw, 'utf-8');

  if (!dryRun) {
    const outPath = join(targetPath, 'migration-config.json');
    await mkdir(dirname(outPath), { recursive: true });
    const payload = JSON.stringify({ migratedFromV1: true, known, extras }, null, 2);
    await writeFile(outPath, payload, 'utf-8');
  }

  onProgress({
    stepKind: 'config',
    stepIndex,
    stepCount,
    stepProgress: 1,
    message: dryRun ? 'config: dry-run ok' : 'config: gravado migration-config.json',
  });

  return ok({
    itemsMigrated: 1,
    itemsSkipped: 0,
    bytesProcessed: bytes,
    nonFatalWarnings: warnings,
  });
}
