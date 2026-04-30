/**
 * MentionPicker — popover ancorado ao composer exibindo typeahead de
 * sources quando o usuário digita `@`. Lista filtra por query (substring
 * em slug ou displayName), permite navegação por teclado e insere marker
 * `[source:slug]` no texto via callback `onSelect`.
 *
 * UX: ancorado ao topo do textarea wrapper (absolute positioned), não
 * ao caret — medir caret exato custaria refactor de editor rich (deferred).
 */

import type { SourceConfigView } from '@g4os/kernel/types';
import type { TranslationKey } from '@g4os/translate';
import { useTranslate } from '@g4os/ui';
import { LayoutGrid } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useId, useMemo, useState } from 'react';

export interface MentionPickerProps {
  readonly sources: readonly SourceConfigView[];
  readonly query: string;
  readonly onSelect: (slug: string) => void;
  readonly onCancel: () => void;
  readonly registerKeyHandler?: (handler: (event: KeyboardEvent) => boolean) => () => void;
  /**
   * Listbox id injetado pelo Composer pai para que `aria-controls` no
   * textarea bata com o id real do `<div role="listbox">`. Caso ausente,
   * gera id local via `useId()` como fallback (componente standalone).
   */
  readonly listboxId?: string;
}

const MAX_ITEMS = 8;

export function MentionPicker({
  sources,
  query,
  onSelect,
  onCancel,
  registerKeyHandler,
  listboxId: listboxIdProp,
}: MentionPickerProps): ReactNode {
  const { t } = useTranslate();
  const [activeIndex, setActiveIndex] = useState(0);
  // Id deve ser o MESMO usado pelo `aria-controls` do textarea pai.
  // Composer injeta via prop; fallback usa `useId()` para
  // suportar uso standalone. Multi-window (ADR-0107) safe.
  const reactId = useId();
  const listboxId = listboxIdProp ?? `mention-picker-listbox-${reactId}`;
  const optionIdPrefix = `mention-option-${reactId}`;

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

  const activeOptionId = matches[activeIndex]
    ? `${optionIdPrefix}-${matches[activeIndex].id}`
    : undefined;

  // Composer textarea (fora deste componente) é o combobox real ARIA — detém
  // foco e navegação. Aqui renderizamos só a listbox pop-up anexa. `div`
  // com `role=listbox` + `div` com `role=option` (biome flaga `ul`/`li` com
  // interactive roles). `tabIndex={-1}` mantém elementos na tree de a11y
  // sem roubar foco do textarea.
  return (
    <div className="absolute bottom-full left-0 z-20 mb-2 w-80 overflow-hidden rounded-lg border border-foreground/10 bg-background shadow-lg ring-1 ring-foreground/5">
      <div className="border-b border-foreground/10 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('chat.mention.title')}
        </span>
      </div>
      <div
        id={listboxId}
        role="listbox"
        tabIndex={-1}
        aria-label={t('chat.mention.title')}
        {...(activeOptionId ? { 'aria-activedescendant': activeOptionId } : {})}
        className="max-h-[240px] overflow-y-auto py-1"
      >
        {matches.map((source, index) => (
          <MentionRow
            key={source.id}
            id={`${optionIdPrefix}-${source.id}`}
            source={source}
            active={index === activeIndex}
            onHover={() => setActiveIndex(index)}
            onSelect={() => onSelect(source.slug)}
          />
        ))}
      </div>
    </div>
  );
}

interface MentionRowProps {
  readonly id: string;
  readonly source: SourceConfigView;
  readonly active: boolean;
  readonly onHover: () => void;
  readonly onSelect: () => void;
}

function MentionRow({ id, source, active, onHover, onSelect }: MentionRowProps): ReactNode {
  const { t } = useTranslate();
  // role="option" aplicado direto no <button> — tabIndex=-1 mantém foco
  // gerenciado pelo textarea via aria-activedescendant.
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={active}
      tabIndex={-1}
      onMouseDown={(e) => {
        e.preventDefault();
        onSelect();
      }}
      onMouseEnter={onHover}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
        active ? 'bg-accent/60' : 'hover:bg-accent/12'
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
