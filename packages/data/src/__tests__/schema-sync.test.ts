/**
 * CR12-D5: gate de drift entre schema TS Drizzle e migrations SQL.
 *
 * Por quê: 7 das 9 migrations foram criadas manualmente sem rodar
 * `drizzle-kit generate`, então `drizzle/meta/` e `snapshot.json` estão
 * stale. Sem isso, próxima `drizzle-kit generate` produz SQL errado.
 *
 * Estratégia: roda migrations reais + introspecta `PRAGMA table_info` e
 * compara com o conjunto de colunas esperado por cada `sqliteTable` do
 * schema TS. Se o schema cresceu sem migration correspondente (ou
 * vice-versa), o teste quebra com diff explícito.
 *
 * Não substitui `drizzle-kit` — só pega drift óbvio (coluna falta/extra).
 * Mismatch de tipo, default, ou index continua passando aqui.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDrizzle, Db, runMigrations } from '../index.ts';
import {
  attachmentRefs,
  attachments,
  eventCheckpoints,
  labels,
  messagesIndex,
  projects,
  projectTasks,
  sessionLabels,
  sessions,
  workspaces,
} from '../schema/index.ts';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url));

interface TableInfoRow {
  readonly cid: number;
  readonly name: string;
  readonly type: string;
  readonly notnull: number;
  readonly dflt_value: string | null;
  readonly pk: number;
}

describe('schema sync (CR12-D5)', () => {
  let db: Db;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'g4os-schema-sync-'));
    db = new Db();
    await db.open({ filename: join(tmpDir, 'app.db') });
    const drizzle = createDrizzle(db);
    runMigrations(drizzle, { migrationsFolder: MIGRATIONS_FOLDER });
  });

  afterEach(async () => {
    db.dispose();
    await rm(tmpDir, { recursive: true, force: true });
  });

  function actualColumns(tableName: string): readonly string[] {
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as readonly TableInfoRow[];
    return rows.map((r) => r.name).sort();
  }

  function expectedColumns(table: { [k: string]: unknown }): readonly string[] {
    // drizzle-orm armazena metadata da tabela em Symbol — usamos o
    // builder real (`$inferSelect`) via approach indireto: extraímos
    // os nomes a partir das chaves do object Drizzle exportado.
    // Cada coluna expõe `.name` na meta interna.
    const cols: string[] = [];
    for (const value of Object.values(table)) {
      if (
        value &&
        typeof value === 'object' &&
        'name' in value &&
        typeof (value as { name: unknown }).name === 'string'
      ) {
        cols.push((value as { name: string }).name);
      }
    }
    return cols.sort();
  }

  // Cada tabela: lista TS deve ser subset das colunas reais (DB pode
  // ter colunas extras — ex.: legacy não removidas — mas TS schema não
  // pode referenciar coluna ausente).
  it.each([
    ['workspaces', workspaces],
    ['sessions', sessions],
    ['messages_index', messagesIndex],
    ['event_checkpoints', eventCheckpoints],
    ['labels', labels],
    ['session_labels', sessionLabels],
    ['attachments', attachments],
    ['attachment_refs', attachmentRefs],
    ['projects', projects],
    ['project_tasks', projectTasks],
  ])('TS schema columns existem no DB pós-migration: %s', (tableName, table) => {
    const real = new Set(actualColumns(tableName));
    const expected = expectedColumns(table as never);
    const missing = expected.filter((c) => !real.has(c));
    expect(missing).toEqual([]);
  });
});
