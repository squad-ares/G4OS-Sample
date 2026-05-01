/**
 * Step `workspaces` — lê `<v1>/workspaces/<uuid>/workspace.json`, parseia
 * com Zod (tolerante a campos faltando), e escreve no V2 via
 * `V2WorkspaceWriter` (callback fornecido pelo caller).
 *
 * Sem `workspaceWriter` em options: roda em modo read-only — conta os
 * workspaces, valida o JSON, mas não persiste. Útil em dry-run e em
 * inspeções de plan antes do write real.
 *
 * Idempotente: writer.exists(id) skip antes de criar — re-rodar não
 * duplica.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { StepContext, StepResult, V2WorkspaceInput } from './contract.ts';

// Schema permissivo — V1 evoluiu ao longo das releases; campos opcionais
// pra absorver versões mais antigas/recentes sem crash. id+name são o
// mínimo viável; sem eles o workspace é skippado com warning.
const V1WorkspaceSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  color: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
});

type V1WorkspaceLike = z.infer<typeof V1WorkspaceSchema>;

export async function migrateWorkspaces(ctx: StepContext): Promise<Result<StepResult, AppError>> {
  const { sourcePath, stepIndex, stepCount, onProgress, dryRun, options } = ctx;
  const wsRoot = join(sourcePath, 'workspaces');

  if (!existsSync(wsRoot)) {
    onProgress({
      stepKind: 'workspaces',
      stepIndex,
      stepCount,
      stepProgress: 1,
      message: 'workspaces: V1 sem diretório workspaces/ — skip',
    });
    return ok(emptyResult());
  }

  let entries: string[];
  try {
    const raw = await readdir(wsRoot, { withFileTypes: true });
    entries = raw.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (cause) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: `migrate-workspaces: falha lendo ${wsRoot}`,
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }

  if (entries.length === 0) {
    onProgress({
      stepKind: 'workspaces',
      stepIndex,
      stepCount,
      stepProgress: 1,
      message: 'workspaces: 0 entradas em V1',
    });
    return ok(emptyResult());
  }

  const warnings: string[] = [];
  let migrated = 0;
  let skipped = 0;
  let bytes = 0;

  for (let i = 0; i < entries.length; i++) {
    const dir = entries[i];
    if (!dir) continue;
    const wsJsonPath = join(wsRoot, dir, 'workspace.json');

    onProgress({
      stepKind: 'workspaces',
      stepIndex,
      stepCount,
      stepProgress: i / entries.length,
      message: `workspaces: ${dir}`,
    });

    if (!existsSync(wsJsonPath)) {
      warnings.push(`${dir}: workspace.json ausente — diretório órfão skipado`);
      skipped++;
      continue;
    }

    let raw: string;
    try {
      raw = await readFile(wsJsonPath, 'utf-8');
      bytes += Buffer.byteLength(raw, 'utf-8');
    } catch (cause) {
      warnings.push(`${dir}: falha lendo workspace.json (${describe(cause)})`);
      skipped++;
      continue;
    }

    let parsed: V1WorkspaceLike;
    try {
      parsed = V1WorkspaceSchema.parse(JSON.parse(raw));
    } catch (cause) {
      warnings.push(`${dir}: workspace.json malformado (${describe(cause)})`);
      skipped++;
      continue;
    }

    const id = parsed.id ?? dir; // id default = nome do diretório (UUID típico)
    const name = parsed.name ?? id;
    const slug = parsed.slug ?? slugify(name);

    const v2Input: V2WorkspaceInput = {
      id,
      name,
      slug,
      ...(parsed.color === undefined ? {} : { color: parsed.color }),
      ...(parsed.description === undefined ? {} : { description: parsed.description }),
      ...(parsed.category === undefined ? {} : { category: parsed.category }),
    };

    // Sem writer: read-only mode (count + parse). Útil em dry-run.
    if (!options.workspaceWriter || dryRun) {
      migrated++;
      continue;
    }

    if (await options.workspaceWriter.exists(id)) {
      skipped++;
      continue;
    }

    try {
      await options.workspaceWriter.create(v2Input);
      migrated++;
    } catch (cause) {
      warnings.push(`${dir}: writer.create falhou (${describe(cause)})`);
      skipped++;
    }
  }

  onProgress({
    stepKind: 'workspaces',
    stepIndex,
    stepCount,
    stepProgress: 1,
    message: `workspaces: ${migrated} migrados, ${skipped} skip`,
  });

  return ok({
    itemsMigrated: migrated,
    itemsSkipped: skipped,
    bytesProcessed: bytes,
    nonFatalWarnings: warnings,
  });
}

function emptyResult(): StepResult {
  return { itemsMigrated: 0, itemsSkipped: 0, bytesProcessed: 0, nonFatalWarnings: [] };
}

function slugify(s: string): string {
  // CR-18 F-M7: usar escape Unicode explícito `̀-ͯ` em vez do
  // range literal `̀-ͯ`. O literal depende do encoding do source file
  // ser preservado por toda a toolchain (TS, tsup, biome) — qualquer
  // re-encode pode quebrar o range. `\u…` é estável.
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
