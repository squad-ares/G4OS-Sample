/**
 * Implementação do `BackupService` IPC. Compõe o `BackupScheduler`
 * (export ZIP + retention) com queries de filesystem (list + delete).
 *
 * Listing: lê `<data>/auto-backups/` e filtra por convenção de naming
 * `<workspaceId>-<timestamp>.zip` (mesma regex do grouper interno do
 * scheduler — ver `groupBackupsByWorkspace`).
 */

import { readdir, stat, unlink } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { BackupEntry, BackupRunResult, BackupService } from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { err, ok, type Result } from 'neverthrow';
import type { BackupScheduler } from './backup-scheduler.ts';

const log = createLogger('backup-service');

const BACKUP_FILE_REGEX = /^([0-9a-f-]{36})-(\d+)\.zip$/;

export interface BackupServiceDeps {
  readonly scheduler: BackupScheduler;
}

export function createBackupService(deps: BackupServiceDeps): BackupService {
  const { scheduler } = deps;

  return {
    async list(): Promise<Result<readonly BackupEntry[], AppError>> {
      try {
        const dir = scheduler.backupDir;
        let entries: readonly string[];
        try {
          entries = await readdir(dir);
        } catch (cause) {
          // Diretório pode ainda não existir se nenhum backup rodou.
          // Caller (UI) trata array vazio como "nenhum backup ainda".
          if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return ok([]);
          throw cause;
        }
        const result: BackupEntry[] = [];
        for (const name of entries) {
          const match = BACKUP_FILE_REGEX.exec(name);
          if (!match) continue;
          const workspaceId = match[1];
          const timestamp = Number(match[2]);
          if (!workspaceId || !Number.isFinite(timestamp)) continue;
          const path = join(dir, name);
          try {
            const stats = await stat(path);
            result.push({
              path,
              workspaceId,
              timestamp,
              sizeBytes: stats.size,
            });
          } catch (statErr) {
            log.warn({ err: statErr, path }, 'stat failed for backup file; skipping');
          }
        }
        // Mais recente primeiro — UI lista nessa ordem.
        result.sort((a, b) => b.timestamp - a.timestamp);
        return ok(result);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        return err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: `backup.list failed: ${message}`,
          }),
        );
      }
    },

    async runNow(workspaceId: string): Promise<Result<BackupRunResult, AppError>> {
      try {
        const result = await scheduler.runForWorkspace(workspaceId);
        return ok({
          entry: {
            path: result.path,
            workspaceId,
            timestamp: extractTimestamp(result.path) ?? Date.now(),
            sizeBytes: result.sizeBytes,
          },
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        log.error({ err: cause, workspaceId }, 'backup.runNow failed');
        return err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: `backup.runNow failed: ${message}`,
          }),
        );
      }
    },

    async delete(path: string): Promise<Result<void, AppError>> {
      try {
        // Path-guard: só apaga se o arquivo está dentro do backupDir
        // gerenciado. Sem isso, caller malicioso poderia passar um path
        // arbitrário e usar o IPC pra apagar qualquer arquivo do disco.
        // CR-18 cleanup: `startsWith(allowedDir + '/')` é POSIX-only
        // (CLAUDE.md "Path safety em tool handlers"). `path.relative` +
        // checagem `..`/absolute cobre Windows e POSIX corretamente.
        // `rel === ''` (resolved == allowedDir) passa nas duas guardas
        // abaixo e é aceito como caminho válido (consistente com original).
        const resolved = resolve(path);
        const allowedDir = resolve(scheduler.backupDir);
        const rel = relative(allowedDir, resolved);
        if (rel.startsWith('..') || isAbsolute(rel)) {
          return err(
            new AppError({
              code: ErrorCode.VALIDATION_ERROR,
              message: 'backup.delete refused: path outside auto-backups directory',
              context: { path },
            }),
          );
        }
        await unlink(resolved);
        return ok(undefined);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        return err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: `backup.delete failed: ${message}`,
          }),
        );
      }
    },
  };
}

function extractTimestamp(path: string): number | undefined {
  const segments = path.split(/[/\\]/);
  const filename = segments[segments.length - 1] ?? '';
  const match = BACKUP_FILE_REGEX.exec(filename);
  if (!match) return undefined;
  const ts = Number(match[2]);
  return Number.isFinite(ts) ? ts : undefined;
}
