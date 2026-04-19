/**
 * Orquestração de startup do SQLite principal do app.
 *
 * Fluxo:
 *   1. `backupBeforeMigration()` — snapshot best-effort. Se for primeira
 *      execução, retorna `null` sem lançar.
 *   2. `new Db()` + `open()` — aplica pragmas (WAL, FK ON, mmap 256MB).
 *   3. `createDrizzle(db)` — cliente tipado sobre `node:sqlite`.
 *   4. `runMigrations()` — aplica todas migration pendente em ordem.
 *      Em falha: rethrow (main process decide se mostra repair screen);
 *      backup preservado permite recovery manual.
 *
 * Esta camada ainda não é invocada por `main/index.ts` — será ligada em
 * TASK-04-04 (event-sourced sessions) quando o DB entrar no caminho
 * crítico. Mantém-se como uma função pura para teste isolado.
 */

import { fileURLToPath } from 'node:url';
import { type AppDb, backupBeforeMigration, createDrizzle, Db, runMigrations } from '@g4os/data';
import { createLogger } from '@g4os/kernel/logger';

const log = createLogger('db-service');

export interface InitDatabaseOptions {
  /** Caminho absoluto do arquivo SQLite. Default: `<appPaths.data>/app.db`. */
  readonly filename?: string;
  /** Caminho absoluto da pasta `drizzle/`. Em dev: resolve do pacote @g4os/data. */
  readonly migrationsFolder?: string;
  /** Se `true`, pula o backup pré-migration (útil em testes/dev). */
  readonly skipBackup?: boolean;
}

export interface InitDatabaseResult {
  readonly db: Db;
  readonly drizzle: AppDb;
  /** Caminho do backup criado, ou `null` se não havia DB (primeira execução). */
  readonly backupPath: string | null;
}

export async function initDatabase(options: InitDatabaseOptions = {}): Promise<InitDatabaseResult> {
  const migrationsFolder = options.migrationsFolder ?? defaultMigrationsFolder();

  const backupPath = options.skipBackup
    ? null
    : await backupBeforeMigration(options.filename ? { source: options.filename } : {});

  const db = new Db();
  await db.open(options.filename ? { filename: options.filename } : {});

  const drizzle = createDrizzle(db);

  try {
    runMigrations(drizzle, { migrationsFolder });
  } catch (err) {
    log.error({ err, backupPath }, 'migration failed — backup preserved for recovery');
    db.dispose();
    throw err;
  }

  return { db, drizzle, backupPath };
}

/**
 * Resolve a pasta `drizzle/` do pacote `@g4os/data` a partir do entry.
 * Em dev com TS source, funciona direto; em build empacotado, será
 * necessário override via `migrationsFolder` com o caminho de `resources/`.
 */
function defaultMigrationsFolder(): string {
  return fileURLToPath(new URL('../../../../../packages/data/drizzle', import.meta.url));
}
