import type { SearchMatch } from '@g4os/kernel/types';
import { useCallback, useEffect, useRef, useState } from 'react';

export type SearchFn = (query: string) => Promise<readonly SearchMatch[]>;

export interface UseSearchMatchesOptions {
  readonly search: SearchFn | undefined;
  readonly query: string;
  readonly debounceMs?: number;
}

export interface UseSearchMatchesResult {
  readonly matches: readonly SearchMatch[];
  readonly isSearching: boolean;
}

const DEFAULT_DEBOUNCE_MS = 150;

export function useSearchMatches({
  search,
  query,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseSearchMatchesOptions): UseSearchMatchesResult {
  const [matches, setMatches] = useState<readonly SearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef(query);

  const runSearch = useCallback(
    async (q: string): Promise<void> => {
      if (!search) {
        setMatches([]);
        return;
      }
      setIsSearching(true);
      try {
        const next = await search(q);
        if (q === latestQueryRef.current) setMatches(next);
      } finally {
        if (q === latestQueryRef.current) setIsSearching(false);
      }
    },
    [search],
  );

  useEffect(() => {
    latestQueryRef.current = query;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setMatches([]);
      setIsSearching(false);
      return;
    }

    timerRef.current = setTimeout(() => {
      void runSearch(trimmed);
    }, debounceMs);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [query, debounceMs, runSearch]);

  return { matches, isSearching };
}
