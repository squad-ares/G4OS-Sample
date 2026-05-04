import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { writeAtomic } from '@g4os/kernel/fs';
import type { LegacyProject } from '@g4os/kernel/types';
import { err, ok, type Result } from 'neverthrow';

const DONE_SENTINEL = '.legacy-import-done';

export interface LegacyMoveError {
  readonly reason: 'target_exists' | 'rename_failed';
  readonly message: string;
}

interface RawProjectMeta {
  id?: unknown;
  name?: unknown;
  slug?: unknown;
  description?: unknown;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

async function readProjectMeta(projPath: string): Promise<RawProjectMeta> {
  try {
    return JSON.parse(await readFile(join(projPath, 'project.json'), 'utf-8')) as RawProjectMeta;
  } catch {
    return {};
  }
}

async function scanRoot(
  root: string,
  canonicalRoot: string,
  seenPaths: Set<string>,
): Promise<LegacyProject[]> {
  if (!existsSync(root)) return [];
  let entries: string[];
  try {
    entries = await readdir(root, { encoding: 'utf8' });
  } catch {
    return [];
  }

  const found: LegacyProject[] = [];
  for (const sub of entries) {
    const projPath = join(root, sub);
    if (!existsSync(join(projPath, 'project.json'))) continue;

    const resolved = resolve(projPath);
    if (seenPaths.has(resolved)) continue;
    seenPaths.add(resolved);

    const meta = await readProjectMeta(projPath);
    const name = asString(meta.name) ?? sub;
    const slug = asString(meta.slug) ?? sub;
    const existingId = asString(meta.id);
    const description = asString(meta.description);

    found.push({
      path: resolved,
      name,
      slug,
      ...(existingId === undefined ? {} : { existingId }),
      ...(description === undefined ? {} : { description }),
      inCanonicalRoot: resolved.startsWith(canonicalRoot),
    });
  }
  return found;
}

export async function discoverLegacyProjects(opts: {
  readonly workspacesRootPath: string;
  readonly workspaceId: string;
  readonly workingDirectory?: string;
}): Promise<LegacyProject[]> {
  const { workspacesRootPath, workspaceId, workingDirectory } = opts;
  const wsRoot = join(workspacesRootPath, workspaceId);
  const canonicalRoot = resolve(join(wsRoot, 'projects'));

  const rawCandidates: string[] = [join(wsRoot, 'projects')];
  if (workingDirectory) {
    rawCandidates.push(join(workingDirectory, 'projects'));
    rawCandidates.push(join(workingDirectory, 'projetos'));
  }

  const candidates = [...new Set(rawCandidates.map((c) => resolve(c)))];
  const seenPaths = new Set<string>();
  const found: LegacyProject[] = [];

  for (const root of candidates) {
    found.push(...(await scanRoot(root, canonicalRoot, seenPaths)));
  }

  return found;
}

/**
 * ADR-0011 (Result pattern): falha em "target already exists" é caminho
 * esperado (usuário pode ter projeto importado parcialmente). Devolve
 * `Result` para o caller decidir UX (skip, abort, sufixar) sem catch
 * genérico.
 */
export async function moveLegacyProject(
  from: string,
  to: string,
): Promise<Result<void, LegacyMoveError>> {
  if (existsSync(to)) {
    return err({
      reason: 'target_exists',
      message: `target already exists: ${to}. Resolve manually before importing.`,
    });
  }
  try {
    await mkdir(join(to, '..'), { recursive: true });
    await rename(from, to);
    return ok(undefined);
  } catch (cause) {
    return err({
      reason: 'rename_failed',
      message: cause instanceof Error ? cause.message : String(cause),
    });
  }
}

export function isDoneMarked(workspacesRootPath: string, workspaceId: string): boolean {
  return existsSync(join(workspacesRootPath, workspaceId, DONE_SENTINEL));
}

export async function markDone(workspacesRootPath: string, workspaceId: string): Promise<void> {
  // CR-34 F-CR34-1: writeAtomic — completa a propagação do ADR-0050 dentro do
  // apps/desktop. O sentinel `.legacy-import-done` é parseado por debug-export
  // e support troubleshoot ("quando rodou a importação V1?"); partial-write em
  // crash deixaria ISO timestamp truncado e a investigação descartaria o
  // arquivo. Mesmo pattern de F-CR33-5 (MIGRATION_DONE_MARKER).
  await writeAtomic(join(workspacesRootPath, workspaceId, DONE_SENTINEL), new Date().toISOString());
}
