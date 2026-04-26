import { cn, useTranslate } from '@g4os/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useAutoScroll } from '../../hooks/use-auto-scroll.ts';
import { useScrollToMatch } from '../../hooks/use-scroll-to-match.ts';
import { type SearchFn, useSearchMatches } from '../../hooks/use-search-matches.ts';
import type { Message } from '../../types.ts';
import type { MessageCardCallbacks } from './message-card/message-card.tsx';
import { MessageCard } from './message-card/message-card.tsx';
import { SearchBar } from './search-bar.tsx';
import { DateSeparator } from './separators/date-separator.tsx';
import { type SuggestedPrompt, WelcomeState } from './welcome-state.tsx';

export interface TranscriptViewProps {
  readonly sessionId: string;
  readonly messages: ReadonlyArray<Message>;
  readonly isStreaming: boolean;
  readonly callbacks?: MessageCardCallbacks;
  readonly search?: SearchFn;
  /** Quando provido e `messages` vazio, renderiza welcome state com
   *  prompts sugeridos. O click chama esta callback com o texto do prompt. */
  readonly onSelectSuggestedPrompt?: (prompt: SuggestedPrompt) => void;
  /** Override dos prompts default do welcome state. */
  readonly suggestedPrompts?: ReadonlyArray<SuggestedPrompt>;
}

interface DateSepItem {
  readonly __dateSep: true;
  readonly date: Date;
  readonly key: string;
}

type VirtualItem = Message | DateSepItem;

function buildItems(messages: ReadonlyArray<Message>): VirtualItem[] {
  const result: VirtualItem[] = [];
  let lastDateStr = '';

  for (const msg of messages) {
    const d = new Date(msg.createdAt);
    const dateStr = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (dateStr !== lastDateStr) {
      lastDateStr = dateStr;
      result.push({ __dateSep: true, date: d, key: `sep-${dateStr}` });
    }
    result.push(msg);
  }

  return result;
}

function estimateHeight(item: VirtualItem): number {
  if ('__dateSep' in item) return 36;
  const msg = item as Message;
  if (msg.role === 'user') return 60;
  const textLen = msg.content.reduce(
    (sum, b) => sum + ('text' in b ? (b as { text: string }).text.length : 0),
    0,
  );
  return Math.max(80, Math.min(800, textLen * 0.4));
}

function isDateSep(item: VirtualItem): item is DateSepItem {
  return '__dateSep' in item;
}

function isMod(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

export const TranscriptView = memo(function TranscriptView({
  sessionId,
  messages,
  isStreaming,
  callbacks,
  search,
  onSelectSuggestedPrompt,
  suggestedPrompts,
}: TranscriptViewProps) {
  const { t } = useTranslate();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const items = useMemo(() => buildItems(messages), [messages]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  const { matches, isSearching } = useSearchMatches({ search, query });

  useEffect(() => {
    if (currentIndex >= matches.length) setCurrentIndex(0);
  }, [matches, currentIndex]);

  useAutoScroll(scrollRef, isStreaming && !searchOpen);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => estimateHeight(items[i] ?? { __dateSep: true, date: new Date(), key: '' }),
    overscan: 5,
    getItemKey: (i) => {
      const it = items[i];
      return it ? (isDateSep(it) ? it.key : it.id) : String(i);
    },
  });

  const currentMatch = matches[currentIndex];
  const matchMessageId = currentMatch?.messageId ?? null;
  const matchItemIndex = useMemo(() => {
    if (!matchMessageId) return null;
    const idx = items.findIndex((it) => !isDateSep(it) && it.id === matchMessageId);
    return idx === -1 ? null : idx;
  }, [items, matchMessageId]);

  useScrollToMatch({ virtualizer, targetIndex: matchItemIndex });

  useEffect(() => {
    if (!search) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isMod(e) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [search]);

  function closeSearch() {
    setSearchOpen(false);
    setQuery('');
    setCurrentIndex(0);
  }

  return (
    <div className="flex h-full flex-col">
      {search && searchOpen && (
        <SearchBar
          query={query}
          onQueryChange={(next) => {
            setQuery(next);
            setCurrentIndex(0);
          }}
          matchCount={matches.length}
          currentIndex={currentIndex}
          onNavigate={setCurrentIndex}
          onClose={closeSearch}
          {...(isSearching ? { isSearching: true } : {})}
        />
      )}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        role="log"
        aria-live="polite"
        aria-label={t('chat.transcript.ariaLabel')}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((vi) => {
            const item = items[vi.index];
            if (!item) return null;
            const isMatch = !isDateSep(item) && matchMessageId === item.id;
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${vi.start}px)`,
                }}
              >
                {isDateSep(item) ? (
                  <div className="px-4">
                    <DateSeparator date={item.date} />
                  </div>
                ) : (
                  <div
                    id={`msg-${item.id}`}
                    className={cn(
                      'transition-shadow',
                      isMatch && 'rounded-lg ring-2 ring-yellow-500/60',
                    )}
                  >
                    <MessageCard
                      sessionId={sessionId}
                      message={item}
                      isLast={vi.index === items.length - 1}
                      isStreaming={isStreaming && vi.index === items.length - 1}
                      {...(callbacks ? { callbacks } : {})}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {messages.length === 0 &&
          (onSelectSuggestedPrompt ? (
            <WelcomeState
              {...(suggestedPrompts ? { prompts: suggestedPrompts } : {})}
              onSelect={onSelectSuggestedPrompt}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('chat.transcript.empty')}
            </div>
          ))}
      </div>
    </div>
  );
});
