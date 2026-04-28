/**
 * Sub-componentes visuais do `SessionsPanel`: empty states, no-search-results,
 * loading skeleton, highlight de matches. Extraído pra manter o panel abaixo
 * do gate de 500 LOC.
 */

import type { TranslationKey } from '@g4os/translate';
import { Button, useTranslate } from '@g4os/ui';
import { SearchX, SquarePen } from 'lucide-react';

export function SessionListSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-2">
      {['sk-a', 'sk-b', 'sk-c', 'sk-d', 'sk-e'].map((key) => (
        <div key={key} className="h-11 animate-pulse rounded-[10px] bg-foreground/5" />
      ))}
    </div>
  );
}

export function HighlightedTitle({
  text,
  query,
}: {
  readonly text: string;
  readonly query: string;
}) {
  if (query.length === 0) return <>{text}</>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-accent/30 text-foreground">
        {text.slice(idx, idx + query.length)}
      </mark>
      <HighlightedTitle text={text.slice(idx + query.length)} query={query} />
    </>
  );
}

export function SessionsEmptyState({
  titleKey,
  descriptionKey,
  actionLabelKey,
  onAction,
}: {
  readonly titleKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  // CR-UX: actionLabel + onAction são opcionais. Sem onAction (ex.: sem
  // workspace ativo), o estado vazio só descreve a situação sem oferecer
  // CTA que não funcionaria.
  readonly actionLabelKey?: TranslationKey;
  readonly onAction?: () => void;
}) {
  const { t } = useTranslate();
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <SquarePen className="size-8 text-muted-foreground/50" aria-hidden={true} />
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold text-foreground">{t(titleKey)}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{t(descriptionKey)}</p>
      </div>
      {actionLabelKey && onAction ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onAction}
          className="h-7 gap-1.5 rounded-[10px] px-3 text-[11px]"
        >
          <SquarePen className="size-3" aria-hidden={true} />
          {t(actionLabelKey)}
        </Button>
      ) : null}
    </div>
  );
}

export function NoSearchResults({
  query,
  onClear,
}: {
  readonly query: string;
  readonly onClear: () => void;
}) {
  const { t } = useTranslate();
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      <SearchX className="size-6 text-muted-foreground/50" aria-hidden={true} />
      <p className="text-[11px] leading-snug text-muted-foreground">
        {t('shell.subsidebar.sessions.noMatches', { query })}
      </p>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
      >
        {t('shell.subsidebar.sessions.searchClear')}
      </Button>
    </div>
  );
}
