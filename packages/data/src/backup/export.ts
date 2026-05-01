/**
 * Backup exporter — produz ZIP contendo:
 *   - `manifest.json` (versão, workspaceId, lista de sessions + attachments)
 *   - `sessions/<sessionId>/events.jsonl` (um por sessão)
 *   - `attachments/<hash>` (blob bruto, sem extensão — tipo vem do SQL)
 *
 * Não inclui dump SQL: a projection é derivada do JSONL via replay
 * (ADR-0010). Isso torna o backup independente do schema do SQLite.
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createLogger } from '@g4os/kernel/logger';
import archiver from 'archiver';
import { eq } from 'drizzle-orm';
import type { AttachmentGateway, AttachmentStorage } from '../attachments/index.ts';
import type { AppDb } from '../drizzle.ts';
import { sessions } from '../schema/sessions.ts';
import { workspaces } from '../schema/workspaces.ts';
import { BACKUP_MANIFEST_VERSION, type BackupManifest } from './manifest.ts';

const log = createLogger('data:backup:export');

/**
 * Limit hard pra ZIP de backup. Workspaces com vários GBs de attachments
 * + milhares de sessões podem produzir ZIPs arbitrariamente grandes;
 * sem cap, processo pode bater OOM ou disk-full mid-write deixando ZIP
 * parcial corrompido. 5 GiB é generoso (cobre ~95% dos workspaces) mas
 * proteção contra estado-degenerado.
 */
export const MAX_BACKUP_SIZE_BYTES = 5 * 1024 * 1024 * 1024;

export interface ExportBackupParams {
  workspaceId: string;
  db: AppDb;
  storage: AttachmentStorage;
  gateway: AttachmentGateway;
  workspaceRoot: string;
  outputPath: string;
  appVersion?: string;
  /** Override `MAX_BACKUP_SIZE_BYTES` (caller que sabe o que faz). */
  maxSizeBytes?: number;
}

export interface ExportBackupResult {
  size: number;
  sessionsCount: number;
  attachmentsCount: number;
  manifestVersion: number;
}

export async function exportWorkspaceBackup(
  params: ExportBackupParams,
): Promise<ExportBackupResult> {
  // Garante que o diretório de destino existe antes de abrir o
  // stream. Sem isso, `createWriteStream` em path inexistente emite erro
  // assíncrono ao invés de falhar fast no caller.
  await mkdir(dirname(params.outputPath), { recursive: true });

  const workspace = params.db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, params.workspaceId))
    .get();
  if (!workspace) throw new Error(`Workspace not found: ${params.workspaceId}`);

  const sessionRows = params.db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.workspaceId, params.workspaceId))
    .all();
  const sessionIds = sessionRows.map((r) => r.id);

  const attachmentHashes = params.gateway.listReferencedHashesForSessions(sessionIds);

  const manifest: BackupManifest = {
    version: BACKUP_MANIFEST_VERSION,
    exportedAt: Date.now(),
    workspaceId: params.workspaceId,
    workspaceName: workspace.name,
    sessionIds: [...sessionIds],
    attachmentHashes: [...attachmentHashes],
    ...(params.appVersion ? { appVersion: params.appVersion } : {}),
  };

  const sizeLimit = params.maxSizeBytes ?? MAX_BACKUP_SIZE_BYTES;

  return new Promise<ExportBackupResult>((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const out = createWriteStream(params.outputPath);

    // Size guard: aborta archive + write stream se ZIP cresce além do
    // limit. Sem isso, workspace gigante consome OOM/disk-full sem
    // signal pro caller até crash do processo.
    let aborted = false;
    archive.on('data', () => {
      if (aborted) return;
      if (archive.pointer() > sizeLimit) {
        aborted = true;
        const err = new Error(
          `backup ZIP exceeds ${sizeLimit} bytes (${archive.pointer()} written); aborting to prevent disk-full`,
        );
        archive.abort();
        out.destroy(err);
      }
    });

    out.on('close', () => {
      if (aborted) return;
      log.info(
        {
          workspaceId: params.workspaceId,
          size: archive.pointer(),
          sessionsCount: sessionIds.length,
          attachmentsCount: attachmentHashes.length,
        },
        'backup exported',
      );
      resolve({
        size: archive.pointer(),
        sessionsCount: sessionIds.length,
        attachmentsCount: attachmentHashes.length,
        manifestVersion: BACKUP_MANIFEST_VERSION,
      });
    });
    out.on('error', reject);
    archive.on('error', reject);
    archive.pipe(out);

    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });

    for (const sid of sessionIds) {
      const eventsPath = join(params.workspaceRoot, 'sessions', sid, 'events.jsonl');
      archive.file(eventsPath, { name: `sessions/${sid}/events.jsonl` });
    }

    for (const hash of attachmentHashes) {
      archive.file(params.storage.path(hash), { name: `attachments/${hash}` });
    }

    archive.finalize().catch(reject);
  });
}
