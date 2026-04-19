/**
 * CLI: `pnpm db:migrate:status`
 *
 * Inspeciona o estado local de migrations do DB principal do app e
 * imprime:
 *   - Arquivo SQLite usado (path resolvido)
 *   - Pasta `drizzle/` (migrations disponíveis no disco)
 *   - Tabela `__drizzle_migrations` (o que já foi aplicado)
 *   - Delta: migrations locais não aplicadas ainda
 *
 * Uso típico:
 *   pnpm db:migrate:status
 *   pnpm db:migrate:status --db /path/to/app.db
 *   pnpm db:migrate:status --migrations /path/to/drizzle
 *
 * Este script é read-only: não cria o DB e não aplica migrations.
 */

/* eslint-disable no-console */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDrizzle, Db, getAppliedMigrations } from '@g4os/data';
import { getAppPaths } from '@g4os/platform';

interface Args {
  db?: string;
  migrations?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--db' && value) {
      args.db = value;
      i += 1;
    } else if (flag === '--migrations' && value) {
      args.migrations = value;
      i += 1;
    }
  }
  return args;
}

function defaultMigrationsFolder(): string {
  return fileURLToPath(new URL('../packages/data/drizzle', import.meta.url));
}

function defaultDbPath(): string {
  return join(getAppPaths().data, 'app.db');
}

function listLocalMigrations(folder: string): string[] {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => {
      const full = join(folder, name);
      return statSync(full).isDirectory() && existsSync(join(full, 'migration.sql'));
    })
    .sort();
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = args.db ?? defaultDbPath();
  const migrationsFolder = args.migrations ?? defaultMigrationsFolder();

  console.log(`Database:    ${dbPath}`);
  console.log(`Migrations:  ${migrationsFolder}`);
  console.log('');

  const local = listLocalMigrations(migrationsFolder);
  console.log(`Local migrations (${local.length}):`);
  for (const name of local) console.log(`  - ${name}`);
  console.log('');

  if (!existsSync(dbPath)) {
    console.log('No database file found — all local migrations are pending.');
    return;
  }

  const db = new Db();
  await db.open({ filename: dbPath });
  try {
    const drizzle = createDrizzle(db);
    const applied = getAppliedMigrations(drizzle);
    console.log(`Applied migrations (${applied.length}):`);
    for (const row of applied) {
      console.log(`  - ${row.name}  [${row.hash.slice(0, 12)}…]  at ${row.appliedAt}`);
    }
    console.log('');

    const appliedNames = new Set(applied.map((r) => r.name));
    const pending = local.filter((name) => !appliedNames.has(name));
    console.log(`Pending (${pending.length}):`);
    for (const name of pending) console.log(`  - ${name}`);
  } finally {
    db.dispose();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
