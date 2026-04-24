/**
 * MentionPicker — popover ancorado ao composer exibindo typeahead de
 * sources quando o usuário digita `@`. Lista filtra por query (substring
 * em slug ou displayName), permite navegação por teclado e insere marker
 * `[source:slug]` no texto via callback `onSelect`.
 *
 * UX: ancorado ao topo do textarea wrapper (absolute positioned), não
 * ao caret — medir caret exato em textarea custaria refactor que a MVP
 * OUTLIER-20 está explicitamente evitando (editor rich fica pra depois).
 */

import type { SourceConfigView } from '@g4os/kernel/types';
import type { TranslationKey } from '@g4os/translate';
import { useTranslate } from '@g4os/ui';
import { LayoutGrid } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useState } from 'react';

export interface MentionPickerProps {
  readonly sources: readonly SourceConfigView[];
  readonly query: string;
  readonly onSelect: (slug: string) => void;
  readonly onCancel: () => void;
  readonly registerKeyHandler?: (handler: (event: KeyboardEvent) => boolean) => () => void;
}

const MAX_ITEMS = 8;

export function MentionPicker({
  sources,
  query,
  onSelect,
  onCancel,
  registerKeyHandler,
}: MentionPickerProps): ReactNode {
  const { t } = useTranslate();
  const [activeIndex, setActiveIndex] = useState(0);

  const matches = useMemo(
    () => filterSources(sources, query).slice(0, MAX_ITEMS),
    [sources, query],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, []);

  useEffect(() => {
    if (activeIndex >= matches.length) setActiveIndex(Math.max(0, matches.length - 1));
  }, [matches, activeIndex]);

  useEffect(() => {
    if (!registerKeyHandler) return;
    return registerKeyHandler((event) =>
      dispatchMentionKey({
        event,
        matches,
        activeIndex,
        setActiveIndex,
        onSelect,
        onCancel,
      }),
    );
  }, [registerKeyHandler, matches, activeIndex, onSelect, onCancel]);

  if (matches.length === 0) {
    return (
      <div className="absolute bottom-full left-0 z-20 mb-2 w-80 rounded-lg border border-foreground/10 bg-background px-4 py-3 shadow-lg ring-1 ring-foreground/5">
        <p className="text-xs text-muted-foreground italic">{t('chat.mention.empty', { query })}</p>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-80 overflow-hidden rounded-lg border border-foreground/10 bg-background shadow-lg ring-1 ring-foreground/5">
      <div className="border-b border-foreground/10 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('chat.mention.title')}
        </span>
      </div>
      <ul className="max-h-[240px] overflow-y-auto py-1">
        {matches.map((source, index) => (
          <MentionRow
            key={source.id}
            source={source}
            active={index === activeIndex}
            onHover={() => setActiveIndex(index)}
            onSelect={() => onSelect(source.slug)}
          />
        ))}
      </ul>
    </div>
  );
}

interface MentionRowProps {
  readonly source: SourceConfigView;
  readonly active: boolean;
  readonly onHover: () => void;
  readonly onSelect: () => void;
}

function MentionRow({ source, active, onHover, onSelect }: MentionRowProps): ReactNode {
  const { t } = useTranslate();
  return (
    <li>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          onSelect();
        }}
        onMouseEnter={onHover}
        className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
          active ? 'bg-accent/60' : 'hover:bg-foreground/5'
        }`}
      >
        <LayoutGrid className="size-3.5 shrink-0 opacity-60" aria-hidden={true} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{source.displayName}</div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">{source.slug}</div>
        </div>
        <span className={`text-[9px] uppercase tracking-wider ${statusColor(source.status)}`}>
          {t(`sources.status.${source.status}` as TranslationKey)}
        </span>
      </button>
    </li>
  );
}

interface DispatchKeyArgs {
  readonly event: KeyboardEvent;
  readonly matches: readonly SourceConfigView[];
  readonly activeIndex: number;
  readonly setActiveIndex: (updater: (i: number) => number) => void;
  readonly onSelect: (slug: string) => void;
  readonly onCancel: () => void;
}

function dispatchMentionKey(args: DispatchKeyArgs): boolean {
  const { event, matches, activeIndex, setActiveIndex, onSelect, onCancel } = args;
  if (event.key === 'ArrowDown') {
    setActiveIndex((i) => Math.min(i + 1, Math.max(0, matches.length - 1)));
    return true;
  }
  if (event.key === 'ArrowUp') {
    setActiveIndex((i) => Math.max(0, i - 1));
    return true;
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    const chosen = matches[activeIndex];
    if (!chosen) return false;
    onSelect(chosen.slug);
    return true;
  }
  if (event.key === 'Escape') {
    onCancel();
    return true;
  }
  return false;
}

function filterSources(
  sources: readonly SourceConfigView[],
  query: string,
): readonly SourceConfigView[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return sources;
  return sources.filter(
    (s) =>
      s.slug.toLowerCase().includes(normalized) || s.displayName.toLowerCase().includes(normalized),
  );
}

function statusColor(status: SourceConfigView['status']): string {
  switch (status) {
    case 'connected':
      return 'text-emerald-600';
    case 'error':
      return 'text-destructive';
    case 'needs_auth':
      return 'text-amber-600';
    default:
      return 'text-muted-foreground';
  }
}
