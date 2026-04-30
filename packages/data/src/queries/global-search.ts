/**
 * Global search — FTS5 sobre `messages_index` + JOIN em
 * `sessions` para recuperar nome da sessão e updatedAt. Limita por
 * workspace. Fallback para LIKE quando MATCH é inválido ou FTS não existe.
 *
 * Não usamos o operador `session:` dentro da query em si — filtro por
 * sessionId é parâmetro separado.
 */

import type { GlobalSearchHit, GlobalSearchResult } from '@g4os/kernel/types';
import type { Db } from '../sqlite/database.ts';

const DEFAULT_LIMIT = 50;
const SNIPPET_TOKENS = 32;

export interface GlobalSearchOptions {
  readonly limit?: number;
  readonly sessionId?: string;
}

export function globalSearch(
  db: Db,
  workspaceId: string,
  query: string,
  options: GlobalSearchOptions = {},
): GlobalSearchResult {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return { messages: [], sessions: [] };
  }
  const limit = options.limit ?? DEFAULT_LIMIT;

  let messages: GlobalSearchHit[];
  try {
    messages = searchMessagesFts(db, workspaceId, trimmed, limit, options.sessionId);
  } catch {
    messages = searchMessagesLike(db, workspaceId, trimmed, limit, options.sessionId);
  }

  const sessions = searchSessionNames(db, workspaceId, trimmed, Math.min(limit, 20));
  return { messages, sessions };
}

function searchMessagesFts(
  db: Db,
  workspaceId: string,
  query: string,
  limit: number,
  sessionId?: string,
): GlobalSearchHit[] {
  const sessionFilter = sessionId ? ' AND mi.session_id = ?' : '';
  const params: (string | number)[] = [workspaceId, toFtsPhrase(query)];
  if (sessionId) params.push(sessionId);
  params.push(limit);

  const stmt = db.prepare(
    `SELECT mi.id AS message_id,
            mi.sequence AS sequence,
            mi.session_id AS session_id,
            s.name AS session_name,
            s.updated_at AS updated_at,
            snippet(messages_fts, 0, '<mark>', '</mark>', '...', ${SNIPPET_TOKENS}) AS snippet
       FROM messages_fts
       JOIN messages_index AS mi ON mi.rowid = messages_fts.rowid
       JOIN sessions AS s ON s.id = mi.session_id
      WHERE s.workspace_id = ?
        AND messages_fts MATCH ?${sessionFilter}
        AND s.status = 'active'
      ORDER BY rank
      LIMIT ?`,
  );
  const rows = stmt.all(...params) as unknown as readonly MessageRow[];
  return rows.map(toHit);
}

function searchMessagesLike(
  db: Db,
  workspaceId: string,
  query: string,
  limit: number,
  sessionId?: string,
): GlobalSearchHit[] {
  const sessionFilter = sessionId ? ' AND mi.session_id = ?' : '';
  const params: (string | number)[] = [workspaceId, toLikePattern(query)];
  if (sessionId) params.push(sessionId);
  params.push(limit);

  const stmt = db.prepare(
    `SELECT mi.id AS message_id,
            mi.sequence AS sequence,
            mi.session_id AS session_id,
            s.name AS session_name,
            s.updated_at AS updated_at,
            substr(mi.content_preview, 1, 200) AS snippet
       FROM messages_index AS mi
       JOIN sessions AS s ON s.id = mi.session_id
      WHERE s.workspace_id = ?
        AND mi.content_preview LIKE ? ESCAPE '\\'${sessionFilter}
        AND s.status = 'active'
      ORDER BY mi.created_at DESC
      LIMIT ?`,
  );
  const rows = stmt.all(...params) as unknown as readonly MessageRow[];
  return rows.map(toHit);
}

function searchSessionNames(
  db: Db,
  workspaceId: string,
  query: string,
  limit: number,
): GlobalSearchResult['sessions'] {
  const stmt = db.prepare(
    `SELECT id, name, updated_at AS updated_at
       FROM sessions
      WHERE workspace_id = ?
        AND name LIKE ? ESCAPE '\\'
        AND status = 'active'
      ORDER BY updated_at DESC
      LIMIT ?`,
  );
  const rows = stmt.all(workspaceId, toLikePattern(query), limit) as unknown as ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly updated_at: number;
  }>;
  return rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at }));
}

interface MessageRow {
  readonly message_id: string;
  readonly sequence: number;
  readonly session_id: string;
  readonly session_name: string;
  readonly updated_at: number;
  readonly snippet: string;
}

function toHit(row: MessageRow): GlobalSearchHit {
  return {
    messageId: row.message_id,
    sequence: row.sequence,
    sessionId: row.session_id,
    sessionName: row.session_name,
    updatedAt: row.updated_at,
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
