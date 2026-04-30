/**
 * Renderização virtualizada da lista de sessões agrupadas.
 *
 * Usado por `SessionsListBody` quando `filteredSessions.length > VIRTUAL_THRESHOLD`.
 * Abaixo do threshold, o componente `SessionGroups` simples é usado (DOM menor
 * + scroll nativo mais fluido para poucas linhas).
 *
 * Virtualização ativa acima de `VIRTUAL_THRESHOLD` (80) items.
 */

import type { TranslationKey } from '@g4os/translate';
import { useTranslate } from '@g4os/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { type MouseEvent as ReactMouseEvent, useMemo, useRef } from 'react';
import { SessionRow } from './session-row.tsx';
import { groupSessionsByDay } from './sessions-panel-grouping.ts';
import type { SessionsPanelSessionItem } from './sessions-panel-types.ts';

export const VIRTUAL_THRESHOLD = 80;

type VRow =
  | {
      readonly kind: 'header';
      readonly key: string;
      readonly labelKey?: TranslationKey;
      readonly label?: string;
    }
  | { readonly kind: 'item'; readonly session: SessionsPanelSessionItem };

function flattenGroups(sessions: readonly SessionsPanelSessionItem[]): readonly VRow[] {
  const groups = groupSessionsByDay(sessions);
  const rows: VRow[] = [];
  for (const g of groups) {
    rows.push({
      kind: 'header',
      key: g.key,
      ...(g.labelKey ? { labelKey: g.labelKey } : {}),
      ...(g.label ? { label: g.label } : {}),
    });
    for (const s of g.items) {
      rows.push({ kind: 'item', session: s });
    }
  }
  return rows;
}

interface VirtualizedSessionGroupsProps {
  readonly sessions: readonly SessionsPanelSessionItem[];
  readonly searchQuery?: string;
  readonly onOpenSession: (id: string) => void;
  readonly onContextMenu?: (
    event: ReactMouseEvent<HTMLElement>,
    session: SessionsPanelSessionItem,
  ) => void;
}

export function VirtualizedSessionGroups({
  sessions,
  searchQuery,
  onOpenSession,
  onContextMenu,
}: VirtualizedSessionGroupsProps) {
  const { t } = useTranslate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => flattenGroups(sessions), [sessions]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i]?.kind === 'header' ? 28 : 52),
    overscan: 10,
    getItemKey: (i) => {
      const row = rows[i];
      return row ? (row.kind === 'header' ? `h:${row.key}` : `i:${row.session.id}`) : i;
    },
  });

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
      <div style={{ height: virtualizer.getTotalSize() }} className="relative">
        {virtualizer.getVirtualItems().map((vrow) => {
          const row = rows[vrow.index];
          if (!row) return null;
          return (
            <div
              key={vrow.key}
              ref={virtualizer.measureElement}
              data-index={vrow.index}
              className="absolute inset-x-0"
              style={{ transform: `translateY(${vrow.start}px)` }}
            >
              {row.kind === 'header' ? (
                <div className="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {row.labelKey ? t(row.labelKey) : (row.label ?? '')}
                </div>
              ) : (
                <SessionRow
                  session={row.session}
                  onOpen={onOpenSession}
                  {...(searchQuery ? { searchQuery } : {})}
                  {...(onContextMenu ? { onContextMenu } : {})}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
