/**
 * Step `sources` — converte `<v1>/sources.json` global em `sources.json`
 * por workspace (formato V2).
 *
 * Modelo V1 (heurístico — versões variam):
 *   `{ "sources": [{ slug, kind, enabled, config, credentialKey,
 *      displayName?, description?, workspaceIds?: string[] }] }`
 *
 * Distribuição:
 *   - Source com `workspaceIds: ['a','b']` → adicionada nos workspaces a, b.
 *   - Source SEM `workspaceIds` → distribuída para `options.knownWorkspaceIds`
 *     (todos os workspaces V2 conhecidos). Se `knownWorkspaceIds` está vazio,
 *     vira warning + skip — caller esqueceu de passar a lista, source viraria
 *     órfã sem worker root.
 *
 * Idempotente: `sourceWriter.exists(wid, slug)` skip antes de add.
 *
 * Modo read-only (sem `sourceWriter`): conta + valida JSON, não persiste.
 * Útil em dry-run.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { type SourceKind, SourceKindSchema } from '@g4os/kernel/schemas';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { StepContext, StepResult, V2SourceInput } from './contract.ts';

// V1 schema permissivo — diferentes minor versions podem ter omitido campos.
// `slug` + `kind` são o mínimo; sem eles a entrada vira warning + skip.
const V1SourceSchema = z.object({
  slug: z.string().min(1).optional(),
  kind: z.string().optional(),
  enabled: z.boolean().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  credentialKey: z.string().optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  workspaceIds: z.array(z.string()).optional(),
});

// Tolera variações: `{sources: [...]}`, `[...]` direto, ou `{}` vazio.
const V1SourcesFileSchema = z.union([
  z.object({ sources: z.array(V1SourceSchema) }),
  z.array(V1SourceSchema),
  z.object({}).passthrough(),
]);

type V1Source = z.infer<typeof V1SourceSchema>;

export async function migrateSources(ctx: StepContext): Promise<Result<StepResult, AppError>> {
  const { sourcePath, stepIndex, stepCount, onProgress, dryRun, options } = ctx;
  const v1FilePath = join(sourcePath, 'sources.json');

  if (!existsSync(v1FilePath)) {
    onProgress({
      stepKind: 'sources',
      stepIndex,
      stepCount,
      stepProgress: 1,
      message: 'sources: V1 sem sources.json — skip',
    });
    return ok(emptyResult());
  }

  let raw: string;
  try {
    raw = await readFile(v1FilePath, 'utf-8');
  } catch (cause) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: `migrate-sources: falha lendo ${v1FilePath}`,
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }

  const bytes = Buffer.byteLength(raw, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: 'migrate-sources: V1 sources.json malformado',
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }

  let sources: V1Source[];
  try {
    const validated = V1SourcesFileSchema.parse(parsed);
    if (Array.isArray(validated)) sources = validated;
    else if ('sources' in validated && Array.isArray(validated.sources))
      sources = validated.sources;
    else sources = [];
  } catch (cause) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: 'migrate-sources: shape de sources.json não reconhecido',
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }

  if (sources.length === 0) {
    onProgress({
      stepKind: 'sources',
      stepIndex,
      stepCount,
      stepProgress: 1,
      message: 'sources: 0 entradas em V1',
    });
    return ok({ ...emptyResult(), bytesProcessed: bytes });
  }

  const warnings: string[] = [];
  let migrated = 0;
  let skipped = 0;

  for (let i = 0; i < sources.length; i++) {
    const v1 = sources[i];
    if (!v1) continue;

    onProgress({
      stepKind: 'sources',
      stepIndex,
      stepCount,
      stepProgress: i / sources.length,
      message: `sources: ${v1.slug ?? `(unnamed-${i})`}`,
    });

    if (!v1.slug) {
      warnings.push(`source #${i}: sem slug — skip`);
      skipped++;
      continue;
    }

    const kind = mapKind(v1.kind);
    if (!kind) {
      warnings.push(`source ${v1.slug}: kind inválido "${v1.kind ?? '(null)'}" — skip`);
      skipped++;
      continue;
    }

    // Distribuição: explicit workspaceIds OU all-known fallback.
    const targets = resolveTargets(v1, options.knownWorkspaceIds, warnings);
    if (targets.length === 0) {
      skipped++;
      continue;
    }

    for (const wid of targets) {
      const input: V2SourceInput = {
        workspaceId: wid,
        slug: v1.slug,
        kind,
        displayName: v1.displayName ?? v1.slug,
        enabled: v1.enabled ?? true,
        config: v1.config ?? {},
        ...(v1.credentialKey === undefined ? {} : { credentialKey: v1.credentialKey }),
        ...(v1.description === undefined ? {} : { description: v1.description }),
      };

      if (!options.sourceWriter || dryRun) {
        migrated++;
        continue;
      }

      if (await options.sourceWriter.exists(wid, v1.slug)) {
        skipped++;
        continue;
      }

      try {
        await options.sourceWriter.add(input);
        migrated++;
      } catch (cause) {
        warnings.push(`source ${v1.slug}@${wid}: writer.add falhou (${describe(cause)})`);
        skipped++;
      }
    }
  }

  onProgress({
    stepKind: 'sources',
    stepIndex,
    stepCount,
    stepProgress: 1,
    message: `sources: ${migrated} migradas, ${skipped} skip`,
  });

  return ok({
    itemsMigrated: migrated,
    itemsSkipped: skipped,
    bytesProcessed: bytes,
    nonFatalWarnings: warnings,
  });
}

function mapKind(raw: string | undefined): SourceKind | null {
  if (!raw) return null;
  const result = SourceKindSchema.safeParse(raw);
  return result.success ? result.data : null;
}

function resolveTargets(
  v1: V1Source,
  knownWorkspaceIds: readonly string[] | undefined,
  warnings: string[],
): readonly string[] {
  if (v1.workspaceIds && v1.workspaceIds.length > 0) {
    return v1.workspaceIds;
  }
  if (!knownWorkspaceIds || knownWorkspaceIds.length === 0) {
    warnings.push(
      `source ${v1.slug ?? '(?)'}: sem workspaceIds em V1 e nenhum knownWorkspaceIds — não há onde distribuir`,
    );
    return [];
  }
  return knownWorkspaceIds;
}

function emptyResult(): StepResult {
  return { itemsMigrated: 0, itemsSkipped: 0, bytesProcessed: 0, nonFatalWarnings: [] };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
