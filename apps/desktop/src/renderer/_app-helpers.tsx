/**
 * Helpers extraídos do `_app.tsx` para manter a rota raiz autenticada
 * abaixo do gate de 500 LOC. Funções puras + adapters de marketplace e
 * render do drawer de tags da sub-sidebar de sessions.
 */

import type { SessionListItem } from '@g4os/features/sessions';
import type { MarketplacePanelItem } from '@g4os/features/shell';
import type { Session } from '@g4os/kernel/types';
import type { useTranslate } from '@g4os/ui';
import type React from 'react';

export function matchPathSegment(pathname: string, root: string): string | undefined {
  const re = new RegExp(`^/${root}/([^/]+)`);
  const match = pathname.match(re);
  return match?.[1];
}

export function matchActiveSessionId(pathname: string): string | undefined {
  const match = pathname.match(/^\/workspaces\/[^/]+\/sessions\/([^/]+)/);
  return match?.[1];
}

export function toSessionListItem(session: Session): SessionListItem {
  return {
    id: session.id,
    workspaceId: session.workspaceId,
    name: session.name,
    lifecycle: session.lifecycle,
    messageCount: session.messageCount,
    ...(session.lastMessageAt === undefined ? {} : { lastMessageAt: session.lastMessageAt }),
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
    ...(session.pinnedAt === undefined ? {} : { pinnedAt: session.pinnedAt }),
    ...(session.starredAt === undefined ? {} : { starredAt: session.starredAt }),
    unread: session.unread,
    labels: session.labels,
    ...(session.parentId === undefined ? {} : { parentId: session.parentId }),
  };
}

type Translate = ReturnType<typeof useTranslate>['t'];

export interface SessionTagsContentArgs {
  readonly activeLabelId: string | null;
  readonly labels: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly color?: string | undefined;
    readonly treeCode: string;
  }>;
  readonly loading: boolean;
  readonly t: Translate;
  readonly onSelect: (labelId: string) => void;
  readonly onClear: () => void;
}

export function renderSessionTagsContent({
  activeLabelId,
  labels,
  loading,
  t,
  onSelect,
  onClear,
}: SessionTagsContentArgs): React.ReactNode {
  if (loading) {
    return <div className="px-4 py-2 text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  if (labels.length === 0) {
    return (
      <div className="px-4 py-2 text-sm text-muted-foreground">{t('session.labels.empty')}</div>
    );
  }

  const sortedLabels = [...labels].sort((left, right) =>
    left.treeCode.localeCompare(right.treeCode),
  );

  return (
    <div className="flex flex-col gap-0.5 px-2 pb-2">
      {activeLabelId ? (
        <button
          type="button"
          onClick={onClear}
          className="mb-1 rounded-[9px] px-2 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-accent/12 hover:text-foreground"
        >
          {t('session.list.filter.clear')}
        </button>
      ) : null}
      {sortedLabels.map((label) => {
        const active = label.id === activeLabelId;
        return (
          <button
            key={label.id}
            type="button"
            onClick={() => onSelect(label.id)}
            aria-pressed={active ? 'true' : 'false'}
            className={`flex items-center gap-2 rounded-[9px] px-2 py-1.5 text-left text-sm transition-colors ${
              active
                ? 'bg-foreground/8 text-foreground'
                : 'text-foreground/80 hover:bg-accent/12 hover:text-foreground'
            }`}
          >
            <span
              aria-hidden={true}
              className="size-2 shrink-0 rounded-full bg-accent"
              style={label.color ? { backgroundColor: label.color } : undefined}
            />
            <span className="min-w-0 truncate">{label.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Adapter best-effort: marketplace router atual retorna `z.array(z.unknown())`,
 * sem schema firme. Tenta extrair os campos quando o item for um objeto; se
 * não casar, devolve placeholder não-clicável que o panel renderiza só com
 * o nome.
 */
export function toMarketplacePanelItem(raw: unknown): MarketplacePanelItem {
  if (raw && typeof raw === 'object') {
    const r = raw as Record<string, unknown>;
    const id = pickString(r['id']) ?? pickString(r['slug']) ?? 'unknown';
    const name = pickString(r['name']) ?? pickString(r['displayName']) ?? id;
    const item: MarketplacePanelItem = { id, name };
    const category = pickString(r['category']);
    if (category) (item as { category?: string }).category = category;
    const description = pickString(r['description']);
    if (description) (item as { description?: string }).description = description;
    const creatorDisplayName = pickString(r['creatorDisplayName']);
    if (creatorDisplayName)
      (item as { creatorDisplayName?: string }).creatorDisplayName = creatorDisplayName;
    if (typeof r['installed'] === 'boolean')
      (item as { installed?: boolean }).installed = r['installed'];
    return item;
  }
  return { id: 'unknown', name: '—' };
}

function pickString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
