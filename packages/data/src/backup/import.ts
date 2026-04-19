/**
 * Backup importer — lê ZIP produzido por `export.ts`, valida manifest,
 * restaura eventos JSONL + attachments no filesystem e reconstrói as
 * projections via `rebuildProjection`.
 *
 * Compatibilidade: aceita apenas `manifest.version == 1`. Versões
 * futuras devem acrescentar branches aqui, nunca editar o branch v1.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createLogger } from '@g4os/kernel/logger';
import { eq } from 'drizzle-orm';
import yauzl from 'yauzl';
import type { AttachmentStorage } from '../attachments/index.ts';
import type { AppDb } from '../drizzle.ts';
import { SessionEventStore } from '../events/event-store.ts';
import { rebuildProjection } from '../events/replay.ts';
import { workspaces } from '../schema/workspaces.ts';
import { type BackupManifest, BackupManifestSchema } from './manifest.ts';

const log = createLogger('data:backup:import');

export interface RestoreBackupParams {
  backupPath: string;
  db: AppDb;
  storage: AttachmentStorage;
  workspaceRoot: string;
  /** Se true, falha quando workspace já existe. Default: false. */
  failIfExists?: boolean;
}

export interface RestoreBackupResult {
  workspaceId: string;
  workspaceName: string;
  sessionsImported: number;
  attachmentsImported: number;
}

export async function restoreWorkspaceBackup(
  params: RestoreBackupParams,
): Promise<RestoreBackupResult> {
  const entries = await readZipEntries(params.backupPath);
  const manifest = parseManifest(extractUtf8(entries, 'manifest.json'));

  if (params.failIfExists) {
    const existing = params.db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, manifest.workspaceId))
      .get();
    if (existing) {
      throw new Error(
        `Workspace ${manifest.workspaceId} already exists. Pass failIfExists: false to overwrite.`,
      );
    }
  }

  for (const sid of manifest.sessionIds) {
    const body = extractBuffer(entries, `sessions/${sid}/events.jsonl`);
    const target = join(params.workspaceRoot, 'sessions', sid, 'events.jsonl');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  for (const hash of manifest.attachmentHashes) {
    const body = extractBuffer(entries, `attachments/${hash}`);
    await params.storage.store(body);
  }

  const eventStore = new SessionEventStore(manifest.workspaceId, {
    workspaceRoot: params.workspaceRoot,
  });
  for (const sid of manifest.sessionIds) {
    await rebuildProjection(params.db, eventStore, sid);
  }

  log.info(
    {
      workspaceId: manifest.workspaceId,
      sessionsImported: manifest.sessionIds.length,
      attachmentsImported: manifest.attachmentHashes.length,
    },
    'backup restored',
  );

  return {
    workspaceId: manifest.workspaceId,
    workspaceName: manifest.workspaceName,
    sessionsImported: manifest.sessionIds.length,
    attachmentsImported: manifest.attachmentHashes.length,
  };
}

interface ZipEntries {
  readonly [fileName: string]: Buffer;
}

function readZipEntries(path: string): Promise<ZipEntries> {
  return new Promise<ZipEntries>((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true }, (openErr, zip) => {
      if (openErr || !zip) return reject(openErr ?? new Error('yauzl: no zip'));
      const out: Record<string, Buffer> = {};

      zip.on('error', reject);
      zip.on('end', () => resolve(out));
      zip.on('entry', (entry: yauzl.Entry) => {
        if (/\/$/.test(entry.fileName)) {
          zip.readEntry();
          return;
        }
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return reject(streamErr ?? new Error('no stream'));
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            out[entry.fileName] = Buffer.concat(chunks);
            zip.readEntry();
          });
          stream.on('error', reject);
        });
      });
      zip.readEntry();
    });
  });
}

function extractBuffer(entries: ZipEntries, name: string): Buffer {
  const body = entries[name];
  if (!body) throw new Error(`Missing entry in backup: ${name}`);
  return body;
}

function extractUtf8(entries: ZipEntries, name: string): string {
  return extractBuffer(entries, name).toString('utf8');
}

function parseManifest(text: string): BackupManifest {
  const raw = JSON.parse(text) as unknown;
  const parsed = BackupManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid backup manifest: ${parsed.error.message}`);
  }
  return parsed.data;
}
