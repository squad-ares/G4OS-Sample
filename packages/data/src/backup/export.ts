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

export interface ExportBackupParams {
  workspaceId: string;
  db: AppDb;
  storage: AttachmentStorage;
  gateway: AttachmentGateway;
  workspaceRoot: string;
  outputPath: string;
  appVersion?: string;
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

  return new Promise<ExportBackupResult>((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const out = createWriteStream(params.outputPath);

    out.on('close', () => {
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
