/**
 * Backup do arquivo SQLite antes de aplicar migrations.
 *
 * Estratégia: copia o trio `app.db` + `app.db-wal` + `app.db-shm` para
 * caminhos com sufixo `.backup-<timestamp>`. Em WAL mode, dados recém-
 * escritos podem residir em `-wal` ainda não checkpointed; copiar só
 * `app.db` perde esses dados em restore. Os 3 arquivos juntos formam o
 * estado consistente.
 *
 * Best-effort: se `-wal`/`-shm` não existirem (DB foi fechado/checkpoint
 * forçado antes), só `app.db` é copiado. Se `app.db` ainda não existe
 * (primeira execução), a função retorna `null` em vez de lançar.
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
  // -wal e -shm são opcionais (podem não existir se o DB foi fechado
  // limpamente). Best-effort, não falha o backup principal.
  await copyIfExists(`${source}-wal`, `${target}-wal`);
  await copyIfExists(`${source}-shm`, `${target}-shm`);
  log.info({ source, target }, 'database backup created (db + wal + shm)');
  return target;
}

async function copyIfExists(source: string, target: string): Promise<void> {
  try {
    await stat(source);
  } catch {
    return;
  }
  try {
    await copyFile(source, target);
  } catch (cause) {
    log.warn({ source, target, err: cause }, 'failed to copy WAL sidecar (continuing)');
  }
}

function defaultSource(): string {
  return join(getAppPaths().data, 'app.db');
}
