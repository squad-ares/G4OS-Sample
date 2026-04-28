/**
 * Tipos compartilhados entre `sessions-panel.tsx` e
 * `sessions-panel-grouping.ts`. Evita ciclo:
 *   panel → grouping → panel (via tipo SessionsPanelSessionItem).
 */

export type SessionsSubTab = 'recent' | 'pinned' | 'starred' | 'unread' | 'archived';

export interface SessionsPanelSessionItem {
  readonly id: string;
  readonly title: string;
  readonly timestamp?: string;
  /** Epoch ms usado para agrupar por dia. */
  readonly sortAt?: number;
  readonly active?: boolean;
  readonly pinned?: boolean;
  readonly starred?: boolean;
  readonly unread?: boolean;
  readonly branched?: boolean;
  /** Quando true, renderiza spinner em vez do unread dot — sessão tem turn rolando. */
  readonly streaming?: boolean;
  /** Nome do projeto vinculado (renderiza chip). */
  readonly projectName?: string;
  readonly labels?: readonly string[];
}
