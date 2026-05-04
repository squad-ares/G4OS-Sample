/**
 * CR-37 F-CR37-13: race cross-session — o efeito de save captura
 * `sessionId` no momento do agendamento (closure). Quando o usuário
 * navega para outra sessão, o primeiro efeito cancela o timeout pendente
 * E atualiza `currentSessionRef` antes que qualquer save ocorra, então o
 * save nunca grava o rascunho da sessão antiga na nova.
 */
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
    // Sessão mudou — cancela save pendente da sessão anterior antes de
    // atualizar a ref, para que o callback do timeout não grave na nova.
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
    // Captura sessionId no momento do agendamento — se o usuário navegar
    // para outra sessão antes do timeout disparar, o efeito anterior já
    // terá cancelado este timeout; mas se de alguma forma o timeout ainda
    // disparar, ele salva na sessão correta (a que estava ativa).
    const savedSessionId = sessionId;
    const timeout = setTimeout(() => {
      draftStore.save(savedSessionId, text);
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
