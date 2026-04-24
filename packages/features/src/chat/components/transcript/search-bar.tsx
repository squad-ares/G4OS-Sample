import { cn, useTranslate } from '@g4os/ui';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';

export interface SearchBarProps {
  readonly query: string;
  readonly onQueryChange: (next: string) => void;
  readonly matchCount: number;
  readonly currentIndex: number;
  readonly onNavigate: (nextIndex: number) => void;
  readonly onClose: () => void;
  readonly isSearching?: boolean;
  readonly className?: string;
}

export function SearchBar({
  query,
  onQueryChange,
  matchCount,
  currentIndex,
  onNavigate,
  onClose,
  isSearching,
  className,
}: SearchBarProps) {
  const { t } = useTranslate();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const goPrev = useCallback(() => {
    if (matchCount === 0) return;
    onNavigate((currentIndex - 1 + matchCount) % matchCount);
  }, [matchCount, currentIndex, onNavigate]);

  const goNext = useCallback(() => {
    if (matchCount === 0) return;
    onNavigate((currentIndex + 1) % matchCount);
  }, [matchCount, currentIndex, onNavigate]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const hasQuery = query.trim().length > 0;
  const noResults = hasQuery && !isSearching && matchCount === 0;

  return (
    <search
      className={cn(
        'flex items-center gap-2 border-b border-foreground/10 bg-foreground-2 px-3 py-2',
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden={true} />
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) goPrev();
            else goNext();
          }
        }}
        placeholder={t('chat.search.placeholder')}
        aria-label={t('chat.search.ariaLabel')}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      {hasQuery && (
        <span
          aria-live="polite"
          className={cn(
            'shrink-0 text-xs text-muted-foreground tabular-nums',
            noResults && 'text-destructive',
          )}
        >
          {noResults ? t('chat.search.noResults') : `${currentIndex + 1}/${matchCount}`}
        </span>
      )}
      <button
        type="button"
        onClick={goPrev}
        disabled={matchCount === 0}
        aria-label={t('chat.search.prevMatch')}
        className="rounded p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={goNext}
        disabled={matchCount === 0}
        aria-label={t('chat.search.nextMatch')}
        className="rounded p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('chat.search.close')}
        className="rounded p-1 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </search>
  );
}
