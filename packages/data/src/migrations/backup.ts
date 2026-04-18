/**
 * Backup do arquivo SQLite antes de aplicar migrations.
 *
 * Estratégia: copia `<data>/app.db` (ou caminho customizado) para
 * `<data>/app.db.backup-<timestamp>`. Usa `copyFile` de `node:fs/promises`
 * — em WAL mode isso é seguro porque `-wal` e `-shm` são reconstruídos
 * automaticamente no próximo `open()`; para recovery total o operador
 * deve restaurar também `app.db-wal` se existir.
 *
 * Best-effort: se o DB ainda não existe (primeira execução), a função
 * retorna `null` em vez de lançar. Motivo: runtime de primeira boot
 * não deve falhar por ausência de fonte de backup.
 */

import { copyFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '@g4os/kernel/logger';
import { getAppPaths } from '@g4os/platform';

const log = createLogger('data:migrations:backup');

export interface BackupOptions {
  /** Caminho absoluto do DB de origem. Default: `<paths.data>/app.db`. */
  readonly source?: string;
  /** Caminho absoluto do backup. Default: `<source>.backup-<timestamp>`. */
  readonly target?: string;
}

/**
 * Retorna o caminho do backup criado, ou `null` se o DB ainda não existe.
 */
export async function backupBeforeMigration(options: BackupOptions = {}): Promise<string | null> {
  const source = options.source ?? defaultSource();
  const target = options.target ?? `${source}.backup-${Date.now()}`;

  try {
    await stat(source);
  } catch {
    log.info({ source }, 'no existing database to backup (first run)');
    return null;
  }

  await copyFile(source, target);
  log.info({ source, target }, 'database backup created');
  return target;
}

function defaultSource(): string {
  return join(getAppPaths().data, 'app.db');
}
