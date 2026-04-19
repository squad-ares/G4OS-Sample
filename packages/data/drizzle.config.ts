/**
 * Config do drizzle-kit para geração de migrations. Drizzle-kit 0.31+
 * aceita `dialect: 'sqlite'` sem driver específico para `generate` —
 * ele produz SQL dialect-agnostic dentro da família SQLite, que roda
 * tanto em better-sqlite3 quanto em node:sqlite (runtime real).
 *
 * Usage: `pnpm drizzle-kit generate` no diretório do pacote.
 */

import type { Config } from 'drizzle-kit';

const config: Config = {
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'sqlite',
};

export default config;
