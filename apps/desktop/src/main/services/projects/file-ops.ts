import type { Dirent } from 'node:fs';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { FsError } from '@g4os/kernel/errors';
import type { ProjectFile } from '@g4os/kernel/types';
import { err, ok, type Result } from 'neverthrow';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_SNAPSHOTS = 10;

const MIME_MAP: Record<string, string> = {
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.js': 'text/javascript',
  '.jsx': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.toml': 'text/plain',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

function mimeOf(filename: string): string {
  return MIME_MAP[extname(filename).toLowerCase()] ?? 'application/octet-stream';
}

async function collectFiles(dir: string, base: string): Promise<ProjectFile[]> {
  const results: ProjectFile[] = [];
  let entries: Dirent<string>[];
  try {
    entries = await readdir(dir, { withFileTypes: true, encoding: 'utf8' });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectFiles(abs, base)));
    } else {
      try {
        const s = await stat(abs);
        results.push({
          relativePath: relative(base, abs),
          size: s.size,
          mtime: s.mtimeMs,
          mimeType: mimeOf(entry.name),
          canSync: s.size <= 1024 * 1024,
        });
      } catch {
        /* skip unreadable files */
      }
    }
  }
  return results;
}

export function listFiles(rootPath: string): Promise<readonly ProjectFile[]> {
  const filesDir = join(rootPath, 'files');
  if (!existsSync(filesDir)) return Promise.resolve([]);
  return collectFiles(filesDir, filesDir);
}

export async function getFileContent(
  rootPath: string,
  relativePath: string,
): Promise<Result<string, FsError>> {
  const resolved = safeResolve(rootPath, relativePath);
  if (resolved.isErr()) return err(resolved.error);
  try {
    const content = await readFile(resolved.value, 'utf-8');
    return ok(content);
  } catch (cause) {
    return err(toFsError(relativePath, cause));
  }
}

export async function saveFile(
  rootPath: string,
  relativePath: string,
  content: string,
): Promise<Result<void, FsError>> {
  if (content.length > MAX_UPLOAD_BYTES) {
    return err(FsError.fileTooLarge(relativePath, content.length, MAX_UPLOAD_BYTES));
  }
  const resolved = safeResolve(rootPath, relativePath);
  if (resolved.isErr()) return err(resolved.error);
  try {
    await snapshotIfExists(rootPath, relativePath, resolved.value);
    await mkdir(join(resolved.value, '..'), { recursive: true });
    await writeFile(resolved.value, content, 'utf-8');
    return ok(undefined);
  } catch (cause) {
    return err(toFsError(relativePath, cause));
  }
}

export async function deleteFile(
  rootPath: string,
  relativePath: string,
): Promise<Result<void, FsError>> {
  const resolved = safeResolve(rootPath, relativePath);
  if (resolved.isErr()) return err(resolved.error);
  try {
    await rm(resolved.value, { force: true });
    return ok(undefined);
  } catch (cause) {
    return err(toFsError(relativePath, cause));
  }
}

async function snapshotIfExists(
  rootPath: string,
  relativePath: string,
  abs: string,
): Promise<void> {
  if (!existsSync(abs)) return;
  const snapDir = join(rootPath, '.g4os', 'snapshots', relativePath);
  await mkdir(snapDir, { recursive: true });
  const snapPath = join(snapDir, `${Date.now()}.bak`);
  await copyFile(abs, snapPath);
  await pruneSnapshots(snapDir);
}

async function pruneSnapshots(snapDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(snapDir, { encoding: 'utf8' });
  } catch {
    return;
  }
  const sorted = entries.filter((e) => e.endsWith('.bak')).sort();
  if (sorted.length > MAX_SNAPSHOTS) {
    for (const old of sorted.slice(0, sorted.length - MAX_SNAPSHOTS)) {
      await rm(join(snapDir, old), { force: true });
    }
  }
}

function safeResolve(rootPath: string, relativePath: string): Result<string, FsError> {
  // CR-27 F-CR27-1: o pattern antigo `abs.startsWith(filesDir)` é vulnerável.
  // Para `filesDir=/work/files` e `relativePath='../files-other/secret'`,
  // resolve produz `/work/files-other/secret` e `startsWith('/work/files')`
  // retorna `true` — guarda burlada (prefix-match sem separador). Também
  // quebra em Windows (separador `\`). Solução canônica em
  // `packages/agents/src/tools/shared/path-guard.ts:resolveInside`: usar
  // `path.relative` e verificar `..`/absoluto. Reimplementado inline aqui
  // pra preservar o tipo de erro `FsError` (resolveInside retorna ToolFailure).
  const base = resolve(join(rootPath, 'files'));
  const target = isAbsolute(relativePath) ? resolve(relativePath) : resolve(base, relativePath);
  const rel = relative(base, target);
  const escaped = rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  if (escaped) {
    return err(FsError.pathTraversal(relativePath));
  }
  return ok(target);
}

function toFsError(relativePath: string, cause: unknown): FsError {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message.includes('ENOENT')) return FsError.notFound(relativePath);
  if (message.includes('EACCES')) return FsError.accessDenied(relativePath);
  if (message.includes('ENOSPC')) return FsError.diskFull(relativePath);
  return new FsError({
    code: 'fs.access_denied' as const,
    message,
    context: { relativePath },
  });
}
