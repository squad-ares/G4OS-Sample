/**
 * Busca full-text sobre o índice de mensagens.
 *
 * Tenta FTS5 primeiro (unicode61 + `snippet()` com `<mark>` delimiters). Se
 * o virtual table não está disponível ou a query é inválida em MATCH
 * syntax, cai para `LIKE` com wildcard simples. O critério de aceite da
 * TASK-11-00-10 exige fallback gracioso; aqui ele é por catch local em vez
 * de feature-detection global.
 *
 * A query de entrada do usuário é sempre embrulhada como uma *phrase*
 * ("query") para o FTS5, o que evita interpretação acidental de operadores
 * FTS (`AND`, `OR`, `*`, `"`) quando a UI só quer busca literal.
 */

import type { SearchMatch } from '@g4os/kernel/types';
import type { Db } from '../sqlite/database.ts';

const DEFAULT_LIMIT = 100;
const SNIPPET_TOKENS = 32;

export interface SearchOptions {
  readonly limit?: number;
}

export function searchMessages(
  db: Db,
  sessionId: string,
  query: string,
  options: SearchOptions = {},
): SearchMatch[] {
  const trimmed = query.trim();
  if (trimmed.length === 0) return [];
  const limit = options.limit ?? DEFAULT_LIMIT;

  try {
    return searchMessagesFts(db, sessionId, trimmed, limit);
  } catch {
    return searchMessagesLike(db, sessionId, trimmed, limit);
  }
}

function searchMessagesFts(db: Db, sessionId: string, query: string, limit: number): SearchMatch[] {
  const stmt = db.prepare(
    `SELECT mi.id AS message_id,
            mi.sequence AS sequence,
            snippet(messages_fts, 0, '<mark>', '</mark>', '...', ${SNIPPET_TOKENS}) AS snippet
       FROM messages_fts
       JOIN messages_index AS mi ON mi.rowid = messages_fts.rowid
      WHERE mi.session_id = ?
        AND messages_fts MATCH ?
      ORDER BY mi.sequence ASC
      LIMIT ${limit}`,
  );
  const rows = stmt.all(sessionId, toFtsPhrase(query)) as unknown as readonly Row[];
  return rows.map(toSearchMatch);
}

function searchMessagesLike(
  db: Db,
  sessionId: string,
  query: string,
  limit: number,
): SearchMatch[] {
  const stmt = db.prepare(
    `SELECT id AS message_id,
            sequence AS sequence,
            substr(content_preview, 1, 200) AS snippet
       FROM messages_index
      WHERE session_id = ?
        AND content_preview LIKE ? ESCAPE '\\'
      ORDER BY sequence ASC
      LIMIT ${limit}`,
  );
  const rows = stmt.all(sessionId, toLikePattern(query)) as unknown as readonly Row[];
  return rows.map(toSearchMatch);
}

interface Row {
  readonly message_id: string;
  readonly sequence: number;
  readonly snippet: string;
}

function toSearchMatch(row: Row): SearchMatch {
  return {
    messageId: row.message_id,
    sequence: row.sequence,
    snippet: row.snippet,
  };
}

function toFtsPhrase(query: string): string {
  return `"${query.replace(/"/g, '""')}"`;
}

function toLikePattern(query: string): string {
  const escaped = query.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `%${escaped}%`;
}
