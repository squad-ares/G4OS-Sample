/**
 * Tipos compartilhados da feature `sessions`.
 *
 * `SessionListItem` é a projeção mínima consumida pela UI — deriva do
 * `Session` do kernel mas remove campos que a lista não renderiza, pra
 * evitar re-renders desnecessários quando só o transcript muda.
 */

import type { Label, Session } from '@g4os/kernel/types';
import type { TranslationKey } from '@g4os/translate';

export interface SessionListItem {
  readonly id: Session['id'];
  readonly workspaceId: Session['workspaceId'];
  readonly name: Session['name'];
  readonly lifecycle: Session['lifecycle'];
  readonly messageCount: Session['messageCount'];
  readonly lastMessageAt?: Session['lastMessageAt'];
  readonly updatedAt: Session['updatedAt'];
  readonly createdAt: Session['createdAt'];
  readonly pinnedAt?: number;
  readonly starredAt?: number;
  readonly unread: boolean;
  readonly labels: readonly string[];
  readonly parentId?: Session['parentId'];
}

export type SessionLifecycleGroup = 'active' | 'archived' | 'deleted';

export type SessionSortKey = 'updated' | 'created' | 'name';

export interface SessionFilters {
  readonly lifecycle: SessionLifecycleGroup;
  readonly labelIds: readonly string[];
  readonly pinned?: boolean;
  readonly starred?: boolean;
  readonly unread?: boolean;
  readonly text?: string;
  readonly sort: SessionSortKey;
}

export const DEFAULT_SESSION_FILTERS: SessionFilters = {
  lifecycle: 'active',
  labelIds: [],
  sort: 'updated',
};

export interface LabelWithChildren extends Label {
  readonly children: readonly LabelWithChildren[];
}

export interface SessionDateGroup {
  readonly key: 'today' | 'yesterday' | 'lastWeek' | 'older' | 'pinned';
  readonly labelKey: TranslationKey;
  readonly items: readonly SessionListItem[];
}
