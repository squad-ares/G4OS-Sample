/**
 * Helper para detectar UNIQUE constraint failed do `node:sqlite`.
 *
 * Pré-checks no service cobrem o caso comum, mas race entre dois callers
 * (insert simultâneo) só é resolvida pelo DB constraint. Este helper
 * extrai a coluna afetada da mensagem do driver para mapear ao error
 * code de domínio correto (ex.: `idx_projects_workspace_slug` →
 * `PROJECT_SLUG_CONFLICT`).
 *
 * Mensagem típica do better-sqlite3/node:sqlite:
 *   "UNIQUE constraint failed: projects.slug"
 *   "UNIQUE constraint failed: projects.workspace_id, projects.slug"
 */

export interface UniqueConstraintInfo {
  readonly columns: readonly string[];
  readonly indexName?: string;
}

export function isUniqueConstraintError(error: unknown): UniqueConstraintInfo | null {
  if (!(error instanceof Error)) return null;
  const msg = error.message;
  if (!msg.includes('UNIQUE constraint failed')) return null;
  const match = /UNIQUE constraint failed: ([^\n]+)/.exec(msg);
  if (!match?.[1]) return { columns: [] };
  const columns = match[1].split(',').map((c) => c.trim());
  return { columns };
}
