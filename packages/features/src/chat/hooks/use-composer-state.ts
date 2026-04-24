import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type DraftStore,
  localStorageDraftStore,
} from '../components/composer/draft-persistence.ts';

const DEFAULT_DEBOUNCE_MS = 500;

export interface UseComposerStateOptions {
  readonly sessionId: string;
  readonly draftStore?: DraftStore;
  readonly debounceMs?: number;
}

export interface ComposerState {
  readonly text: string;
  readonly setText: (next: string) => void;
  readonly reset: () => void;
  readonly isPristine: boolean;
}

export function useComposerState({
  sessionId,
  draftStore = localStorageDraftStore,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: UseComposerStateOptions): ComposerState {
  const [text, setTextState] = useState<string>(() => draftStore.load(sessionId));
  const currentSessionRef = useRef(sessionId);
  const pendingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (currentSessionRef.current === sessionId) return;
    currentSessionRef.current = sessionId;
    if (pendingTimeoutRef.current !== null) {
      clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }
    setTextState(draftStore.load(sessionId));
  }, [sessionId, draftStore]);

  useEffect(() => {
    if (pendingTimeoutRef.current !== null) {
      clearTimeout(pendingTimeoutRef.current);
    }
    const timeout = setTimeout(() => {
      draftStore.save(sessionId, text);
      pendingTimeoutRef.current = null;
    }, debounceMs);
    pendingTimeoutRef.current = timeout;
    return () => {
      clearTimeout(timeout);
    };
  }, [text, sessionId, draftStore, debounceMs]);

  const setText = useCallback((next: string) => {
    setTextState(next);
  }, []);

  const reset = useCallback(() => {
    setTextState('');
    draftStore.clear(sessionId);
    if (pendingTimeoutRef.current !== null) {
      clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }
  }, [sessionId, draftStore]);

  return {
    text,
    setText,
    reset,
    isPristine: text.trim().length === 0,
  };
}
