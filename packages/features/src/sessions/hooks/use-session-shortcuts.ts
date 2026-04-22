/**
 * Hook de atalhos globais da feature sessions:
 *   - Cmd/Ctrl + N → criar nova sessão (TASK-11-01-02)
 *   - Cmd/Ctrl + K → abrir command palette / global search (TASK-11-01-03)
 *
 * Ignora o evento quando o foco está em input/textarea editável, a
 * menos que o atalho seja especificamente o Cmd+K (que deve abrir a
 * palette de qualquer lugar).
 */

import { useEffect } from 'react';

export interface SessionShortcutHandlers {
  readonly onNewSession?: () => void;
  readonly onOpenSearch?: () => void;
  readonly enabled?: boolean;
}

export function useSessionShortcuts({
  onNewSession,
  onOpenSearch,
  enabled = true,
}: SessionShortcutHandlers): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => handleShortcut(event, onNewSession, onOpenSearch);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onNewSession, onOpenSearch, enabled]);
}

function handleShortcut(
  event: KeyboardEvent,
  onNewSession: (() => void) | undefined,
  onOpenSearch: (() => void) | undefined,
): void {
  if (!(event.metaKey || event.ctrlKey)) return;
  if (event.key === 'n' || event.key === 'N') {
    if (isInEditable(event.target)) return;
    event.preventDefault();
    onNewSession?.();
    return;
  }
  if (event.key === 'k' || event.key === 'K') {
    event.preventDefault();
    onOpenSearch?.();
  }
}

function isInEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea') return true;
  if (target.isContentEditable) return true;
  return false;
}
