/**
 * CR-37 F-CR37-11: AbortController por chamada — aborta a request anterior
 * quando query muda ou hook desmonta. Evita race onde a promise stale
 * resolve depois da promise atual e vira `isSearching` para false
 * prematuramente enquanto a busca ainda está em voo.
 */
import type { SearchMatch } from '@g4os/kernel/types';
import { useCallback, useEffect, useRef, useState } from 'react';

export type SearchFn = (query: string, signal?: AbortSignal) => Promise<readonly SearchMatch[]>;

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
  const abortRef = useRef<AbortController | null>(null);

  const runSearch = useCallback(
    async (q: string, signal: AbortSignal): Promise<void> => {
      if (!search) {
        setMatches([]);
        return;
      }
      setIsSearching(true);
      try {
        const next = await search(q, signal);
        if (!signal.aborted) setMatches(next);
      } catch (err) {
        // Ignora erros de abort — são esperados quando query muda.
        if (signal.aborted) return;
        throw err;
      } finally {
        if (!signal.aborted) setIsSearching(false);
      }
    },
    [search],
  );

  useEffect(() => {
    // Cancela timer e request anteriores.
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    abortRef.current?.abort();

    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setMatches([]);
      setIsSearching(false);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    timerRef.current = setTimeout(() => {
      void runSearch(trimmed, ctrl.signal);
    }, debounceMs);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      ctrl.abort();
    };
  }, [query, debounceMs, runSearch]);

  return { matches, isSearching };
}
