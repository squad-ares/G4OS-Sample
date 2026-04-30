/**
 * SessionList virtualizado. TanStack Virtual monta só os itens visíveis
 * + overscan; sessões pinadas entram no bucket "Pinned" no topo e
 * separam da timeline normal via group header.
 *
 * Group headers são tratados como itens virtuais com altura própria — o
 * virtualizer vê `flatItems` linearizado (header + items + header + ...),
 * não a árvore agrupada.
 */

import type { TranslationKey } from '@g4os/translate';
import { Button, useTranslate } from '@g4os/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Plus } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { groupSessions } from '../logic/grouping.ts';
import type { SessionListItem } from '../types.ts';
import { SessionListItemRow } from './session-list-item.tsx';

export interface SessionListProps {
  readonly sessions: readonly SessionListItem[];
  readonly activeSessionId: string | null;
  readonly isLoading?: boolean;
  readonly hasMore?: boolean;
  readonly onOpen: (id: string) => void;
  readonly onLoadMore?: () => void;
  readonly onCreate?: () => void;
  readonly onContextMenu?: (event: React.MouseEvent, session: SessionListItem) => void;
  /** Altura aproximada de cada item (px). Default 62. */
  readonly estimatedItemSize?: number;
  /** Altura do group header (px). Default 32. */
  readonly headerSize?: number;
}

type Row =
  | { readonly kind: 'header'; readonly id: string; readonly labelKey: TranslationKey }
  | { readonly kind: 'item'; readonly id: string; readonly session: SessionListItem };

export function SessionList({
  sessions,
  activeSessionId,
  isLoading,
  hasMore,
  onOpen,
  onLoadMore,
  onCreate,
  onContextMenu,
  estimatedItemSize = 62,
  headerSize = 32,
}: SessionListProps) {
  const { t } = useTranslate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows: readonly Row[] = useMemo(() => {
    const groups = groupSessions(sessions);
    const out: Row[] = [];
    for (const group of groups) {
      out.push({ kind: 'header', id: `group:${group.key}`, labelKey: group.labelKey });
      for (const item of group.items) {
        out.push({ kind: 'item', id: item.id, session: item });
      }
    }
    return out;
  }, [sessions]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (rows[index]?.kind === 'header' ? headerSize : estimatedItemSize),
    overscan: 8,
    getItemKey: (index) => rows[index]?.id ?? index,
  });

  useEffect(() => {
    if (!hasMore || !onLoadMore) return;
    const last = virtualizer.getVirtualItems().at(-1);
    if (last && last.index >= rows.length - 5) onLoadMore();
  }, [virtualizer, rows.length, hasMore, onLoadMore]);

  if (isLoading && sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('session.list.loading')}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        title={t('session.list.empty.title')}
        description={t('session.list.empty.description')}
        actionLabel={t('session.list.empty.action')}
        {...(onCreate ? { onAction: onCreate } : {})}
      />
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto overflow-x-hidden">
      <div style={{ height: virtualizer.getTotalSize() }} className="relative">
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          if (!row) return null;
          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              className="absolute inset-x-0"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {row.kind === 'header' ? (
                <div className="px-3 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t(row.labelKey)}
                </div>
              ) : (
                <div className="px-2">
                  <SessionListItemRow
                    session={row.session}
                    isActive={row.session.id === activeSessionId}
                    onOpen={onOpen}
                    {...(onContextMenu ? { onContextMenu } : {})}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly onAction?: () => void;
}

function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
      {onAction ? (
        <Button size="sm" onClick={onAction} className="gap-2">
          <Plus className="size-4" aria-hidden={true} />
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
