import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { createLogger } from '@g4os/kernel/logger';
import yauzl from 'yauzl';
import {
  isPathSensitive,
  parseManifest,
  type WorkspaceTransferManifest,
} from './transfer-manifest.ts';

const log = createLogger('workspace-transfer-import');

export interface ReadWorkspaceZipResult {
  readonly manifest: WorkspaceTransferManifest;
  readonly workspaceConfig: Record<string, unknown>;
  readonly files: ReadonlyMap<string, Buffer>;
}

export async function readWorkspaceZip(zipPath: string): Promise<ReadWorkspaceZipResult> {
  const entries = await readZipEntries(zipPath);

  const manifestRaw = entries.get('manifest.json');
  if (!manifestRaw) throw new Error('workspace zip missing manifest.json');
  const manifestJson = JSON.parse(manifestRaw.toString('utf8')) as unknown;
  const manifestResult = parseManifest(manifestJson);
  if (manifestResult.isErr()) {
    throw new Error(`invalid workspace manifest: ${manifestResult.error.reason}`);
  }
  const manifest = manifestResult.value;

  const configRaw = entries.get('workspace/config.json');
  if (!configRaw) throw new Error('workspace zip missing workspace/config.json');
  const workspaceConfig = JSON.parse(configRaw.toString('utf8')) as Record<string, unknown>;

  const files = new Map<string, Buffer>();
  const prefix = 'workspace/files/';
  for (const [name, body] of entries) {
    if (!name.startsWith(prefix)) continue;
    const rel = name.slice(prefix.length);
    if (!rel || rel.endsWith('/')) continue;
    if (isPathSensitive(rel)) {
      log.warn({ path: rel }, 'skipping sensitive entry during import');
      continue;
    }
    files.set(rel, body);
  }

  return { manifest, workspaceConfig, files };
}

export async function extractWorkspaceFiles(
  files: ReadonlyMap<string, Buffer>,
  targetRootPath: string,
): Promise<number> {
  let writtenCount = 0;
  const normalizedRoot = normalize(targetRootPath);
  for (const [rel, body] of files) {
    const target = normalize(join(targetRootPath, rel));
    if (!isInside(target, normalizedRoot)) {
      log.warn({ path: rel, target }, 'rejecting path-traversal entry during import');
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
    writtenCount += 1;
  }
  return writtenCount;
}

function isInside(child: string, parent: string): boolean {
  const parentWithSep = parent.endsWith(sep) ? parent : `${parent}${sep}`;
  return child === parent || child.startsWith(parentWithSep);
}

function readZipEntries(path: string): Promise<Map<string, Buffer>> {
  return new Promise<Map<string, Buffer>>((resolve, reject) => {
    yauzl.open(
      path,
      { lazyEntries: true },
      (openErr: Error | null, zip: yauzl.ZipFile | undefined) => {
        if (openErr || !zip) {
          reject(openErr ?? new Error('yauzl: no zip'));
          return;
        }
        const out = new Map<string, Buffer>();

        zip.on('error', reject);
        zip.on('end', () => resolve(out));
        zip.on('entry', (entry: yauzl.Entry) => {
          if (/\/$/.test(entry.fileName)) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(
            entry,
            (streamErr: Error | null, stream: NodeJS.ReadableStream | undefined) => {
              if (streamErr || !stream) {
                reject(streamErr ?? new Error('yauzl: no stream'));
                return;
              }
              const chunks: Buffer[] = [];
              stream.on('data', (chunk: Buffer) => chunks.push(chunk));
              stream.on('end', () => {
                out.set(entry.fileName, Buffer.concat(chunks));
                zip.readEntry();
              });
              stream.on('error', reject);
            },
          );
        });
        zip.readEntry();
      },
    );
  });
}
