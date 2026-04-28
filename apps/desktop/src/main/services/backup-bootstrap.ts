/**
 * Bootstrap do BackupScheduler com attachment storage/gateway. Gateway
 * é leve (apenas refs Drizzle); storage usa diretório default
 * (`<appPaths.data>/attachments`). Scheduler roda 24h com retenção
 * 7/4/3 conforme ADR-0045 (CR5-01 wiring).
 */

import type { AppDb } from '@g4os/data';
import { AttachmentGateway, AttachmentStorage } from '@g4os/data/attachments';
import { BackupScheduler } from './backup-scheduler.ts';

export interface BackupBootstrapOptions {
  readonly drizzle: AppDb;
  readonly appVersion: string;
}

export function createBackupScheduler(options: BackupBootstrapOptions): BackupScheduler {
  const attachmentStorage = new AttachmentStorage();
  const attachmentGateway = new AttachmentGateway(options.drizzle, attachmentStorage);
  return new BackupScheduler({
    db: options.drizzle,
    storage: attachmentStorage,
    gateway: attachmentGateway,
    appVersion: options.appVersion,
  });
}
