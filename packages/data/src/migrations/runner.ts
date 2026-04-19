/**
 * Migration runner sobre `drizzle-orm/node-sqlite/migrator`.
 *
 * Lê a pasta `drizzle/` (gerada por `drizzle-kit generate`), split cada
 * arquivo `migration.sql` por `--> statement-breakpoint` e aplica cada
 * statement dentro de uma única transação por migration. A tabela
 * `__drizzle_migrations` é criada automaticamente e rastreia o hash
 * SHA-256 de cada migration já aplicada — re-runs são idempotentes.
 *
 * Por que usamos o adapter `node-sqlite` (não `better-sqlite3`):
 *   - `Db` (packages/data/src/sqlite/database.ts) envolve `node:sqlite`
 *     nativo (Node 24 LTS). Ver ADR-0040a.
 *   - Único driver Drizzle compatível com `DatabaseSync` é
 *     `drizzle-orm/node-sqlite` (ADR-0042).
 *
 * Fluxo esperado de startup (ver `apps/desktop/src/main/services/db-service.ts`):
 *   1. `backupBeforeMigration()` (best-effort se DB existir)
 *   2. `new Db()` + `open()` aplica pragmas (WAL, FK ON)
 *   3. `createDrizzle(db)`
 *   4. `runMigrations(drizzle, folder)` aplica tudo pendente em ordem
 *   5. Em caso de falha: backup preservado, DB permanece no último
 *      commit bem-sucedido (drizzle roda cada migration em transação).
 */

import { createLogger } from '@g4os/kernel/logger';
import { migrate } from 'drizzle-orm/node-sqlite/migrator';
import type { AppDb } from '../drizzle.ts';

const log = createLogger('data:migrations');

export interface RunMigrationsOptions {
  /** Caminho absoluto da pasta de migrations (onde estão os `<timestamp>_<name>/migration.sql`). */
  readonly migrationsFolder: string;
  /** Nome da tabela de controle. Default: `__drizzle_migrations`. */
  readonly migrationsTable?: string;
}

export interface MigrationStatus {
  readonly id: number;
  readonly hash: string;
  readonly name: string;
  readonly createdAt: number;
  readonly appliedAt: string;
}

/**
 * Aplica todas as migrations pendentes em ordem cronológica do nome
 * da pasta (`YYYYMMDDHHMMSS_*`). Idempotente: se todas já foram
 * aplicadas, é um no-op barato.
 */
export function runMigrations(db: AppDb, options: RunMigrationsOptions): void {
  const { migrationsFolder, migrationsTable } = options;
  const start = Date.now();
  log.info({ migrationsFolder }, 'running migrations');

  try {
    migrate(db, migrationsTable ? { migrationsFolder, migrationsTable } : { migrationsFolder });
    log.info({ durationMs: Date.now() - start, migrationsFolder }, 'migrations complete');
  } catch (err) {
    log.fatal({ err, migrationsFolder }, 'migration failed');
    throw err;
  }
}

/**
 * Lê a tabela `__drizzle_migrations` e retorna o que já foi aplicado.
 * Se a tabela não existir (db sem migrations ainda), retorna `[]`.
 */
export function getAppliedMigrations(
  db: AppDb,
  migrationsTable: string = '__drizzle_migrations',
): readonly MigrationStatus[] {
  const sql = `SELECT id, hash, name, created_at as createdAt, applied_at as appliedAt
               FROM "${migrationsTable}" ORDER BY id ASC`;
  try {
    const rows = db.$client.prepare(sql).all() as unknown as MigrationStatus[];
    return rows;
  } catch {
    return [];
  }
}
