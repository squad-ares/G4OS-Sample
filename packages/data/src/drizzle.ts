/**
 * Factory do cliente Drizzle sobre o wrapper `Db` (node:sqlite).
 *
 * Usa `drizzle-orm/node-sqlite` — adapter first-class para `DatabaseSync`
 * do Node 24 LTS. Vê ADR-0040a (driver node:sqlite) e TASK-04-02.
 *
 * Uso:
 *   const db = new Db();
 *   await db.open({ filename: 'app.db' });
 *   const drizzle = createDrizzle(db);
 *   await drizzle.insert(workspaces).values({ ... });
 *   applyFtsSchema(db);
 */

import { drizzle } from 'drizzle-orm/node-sqlite';
import * as schema from './schema/index.ts';
import type { Db } from './sqlite/database.ts';

export type AppSchema = typeof schema;

export function createDrizzle(db: Db) {
  return drizzle({ client: db.raw, schema });
}

export type AppDb = ReturnType<typeof createDrizzle>;
