import type { Dirent } from 'node:fs';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import type { ProjectFile } from '@g4os/kernel/types';

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

export function getFileContent(rootPath: string, relativePath: string): Promise<string> {
  const abs = safeResolve(rootPath, relativePath);
  return readFile(abs, 'utf-8');
}

export async function saveFile(
  rootPath: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const abs = safeResolve(rootPath, relativePath);
  if (content.length > MAX_UPLOAD_BYTES) {
    throw new Error(`file exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MiB limit`);
  }
  await snapshotIfExists(rootPath, relativePath, abs);
  await mkdir(join(abs, '..'), { recursive: true });
  await writeFile(abs, content, 'utf-8');
}

export async function deleteFile(rootPath: string, relativePath: string): Promise<void> {
  const abs = safeResolve(rootPath, relativePath);
  await rm(abs, { force: true });
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

function safeResolve(rootPath: string, relativePath: string): string {
  const filesDir = join(rootPath, 'files');
  const abs = resolve(filesDir, relativePath);
  if (!abs.startsWith(filesDir)) {
    throw new Error('path traversal attempt');
  }
  return abs;
}
