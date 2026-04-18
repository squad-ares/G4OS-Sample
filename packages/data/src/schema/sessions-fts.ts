/**
 * Full-text search sobre `messages_index.content_preview` via SQLite FTS5.
 *
 * Drizzle não modela virtual tables diretamente, então declaramos o FTS
 * como SQL cru executado no boot do DB (`applyFtsSchema`). Usamos a
 * configuração `content='messages_index' content_rowid='rowid'` para que
 * o FTS seja **external-content** — não duplica o conteúdo, só mantém o
 * índice invertido. Três triggers (insert/delete/update) mantêm o FTS
 * em sincronia com a tabela de origem.
 *
 * Consulta tipada em `drizzle`:
 *   db.all(sql`SELECT session_id, content_preview FROM messages_index
 *              WHERE rowid IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ${term})`)
 */

export const MESSAGES_FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  content_preview,
  content='messages_index',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS messages_fts_ai AFTER INSERT ON messages_index BEGIN
  INSERT INTO messages_fts(rowid, content_preview) VALUES (new.rowid, new.content_preview);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_ad AFTER DELETE ON messages_index BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content_preview) VALUES('delete', old.rowid, old.content_preview);
END;

CREATE TRIGGER IF NOT EXISTS messages_fts_au AFTER UPDATE ON messages_index BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, content_preview) VALUES('delete', old.rowid, old.content_preview);
  INSERT INTO messages_fts(rowid, content_preview) VALUES (new.rowid, new.content_preview);
END;
`.trim();

export interface FtsApplier {
  exec(sql: string): void;
}

/** Aplica o schema FTS idempotentemente (usa `IF NOT EXISTS`). */
export function applyFtsSchema(db: FtsApplier): void {
  db.exec(MESSAGES_FTS_SQL);
}
