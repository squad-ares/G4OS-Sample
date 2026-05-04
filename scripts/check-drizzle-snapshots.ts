#!/usr/bin/env tsx
/**
 * Gate forward-only: cada migration NOVA em
 * `packages/data/drizzle/<timestamp>_<name>/` precisa ter `snapshot.json`
 * adjacente ao `migration.sql`. Migrations legadas listadas em
 * `LEGACY_NO_SNAPSHOT` são toleradas — drizzle perdeu histórico
 * incremental nelas (criadas manualmente em sprint 0/1 sem rodar
 * `drizzle-kit generate`).
 *
 * Por que apenas forward-only: rodar `drizzle-kit generate` hoje produz
 * uma "baseline" nova que recria todas as tabelas existentes — seria
 * destrutiva em DBs reais. Reconstruir snapshots históricos exige work
 * manual (carry forward schema state migration-por-migration). Aceito
 * como tech debt; o gate aqui impede que NOVAS migrations entrem com
 * o mesmo problema.
 *
 * 10c-09 (Track 2 — Data hardening).
 */

import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DRIZZLE_DIR = join('packages', 'data', 'drizzle');

// Migrations criadas antes do gate existir, sem snapshot. NÃO ADICIONAR
// MAIS — se uma migration nova entrar aqui, é regression. Plano de
// reconstrução documentado em `docs/deferred/drizzle-snapshots.md`.
const LEGACY_NO_SNAPSHOT: ReadonlySet<string> = new Set([
  '20260422000000_sessions_labels_branching',
  '20260422020000_projects',
  '20260423140000_sessions_provider_model',
  '20260423170000_sessions_working_directory',
  '20260424000000_sessions_source_slugs',
  '20260427000000_attachment_refs_cascade',
  '20260427120000_projects_slug_unique',
]);

if (!existsSync(DRIZZLE_DIR)) {
  console.error(`[FAIL] drizzle dir not found: ${DRIZZLE_DIR}`);
  process.exit(2);
}

const entries = readdirSync(DRIZZLE_DIR, { withFileTypes: true });
const migrationDirs = entries
  .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
  .map((e) => e.name)
  .sort();

if (migrationDirs.length === 0) {
  console.error(`[FAIL] no migrations found in ${DRIZZLE_DIR}`);
  process.exit(1);
}

const missing: string[] = [];
for (const dir of migrationDirs) {
  const sqlPath = join(DRIZZLE_DIR, dir, 'migration.sql');
  const snapshotPath = join(DRIZZLE_DIR, dir, 'snapshot.json');
  if (!existsSync(sqlPath)) {
    console.error(`[FAIL] ${dir}: migration.sql missing`);
    missing.push(`${dir}/migration.sql`);
    continue;
  }
  if (!existsSync(snapshotPath) && !LEGACY_NO_SNAPSHOT.has(dir)) {
    missing.push(dir);
  }
}

if (missing.length === 0) {
  const legacyCount = LEGACY_NO_SNAPSHOT.size;
  const enforced = migrationDirs.length - legacyCount;
  console.log(
    `[OK] ${enforced} drizzle migrations have snapshot.json (${legacyCount} legacy excused — see docs/deferred/drizzle-snapshots.md)`,
  );
  process.exit(0);
}

console.error(
  `\n[FAIL] ${missing.length} new migrations missing snapshot.json (legacy list não cobre):`,
);
for (const dir of missing) console.error(`  - ${dir}`);
console.error(`\nFix: cd packages/data && pnpm drizzle-kit generate.`);
console.error(
  `\nSe a migration foi criada manualmente, rode generate antes de commitar pra que drizzle inclua snapshot.json no diretório.`,
);
process.exit(1);
