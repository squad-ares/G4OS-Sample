import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { LegacyProject } from '@g4os/kernel/types';

const DONE_SENTINEL = '.legacy-import-done';

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

export async function moveLegacyProject(from: string, to: string): Promise<void> {
  if (existsSync(to)) {
    throw new Error(`target already exists: ${to}. Resolve manually before importing.`);
  }
  await mkdir(join(to, '..'), { recursive: true });
  await rename(from, to);
}

export function isDoneMarked(workspacesRootPath: string, workspaceId: string): boolean {
  return existsSync(join(workspacesRootPath, workspaceId, DONE_SENTINEL));
}

export async function markDone(workspacesRootPath: string, workspaceId: string): Promise<void> {
  await writeFile(
    join(workspacesRootPath, workspaceId, DONE_SENTINEL),
    new Date().toISOString(),
    'utf-8',
  );
}
