import { useEffect } from 'react';

export interface SessionShortcutHandlers {
  readonly onStop?: () => void;
  readonly onRetry?: () => void;
  readonly enabled?: boolean;
}

/**
 * Registra atalhos de teclado para ações de sessão (TASK-11-00-08):
 * Cmd+. (macOS) / Ctrl+. (outros) → stop turn atual
 * Cmd+R / Ctrl+R → retry última turn (preventDefault para não recarregar)
 */
export function useSessionShortcuts({
  onStop,
  onRetry,
  enabled = true,
}: SessionShortcutHandlers): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent): void => {
      const modKey = event.metaKey || event.ctrlKey;
      if (!modKey) return;
      if (event.key === '.' && onStop) {
        event.preventDefault();
        onStop();
        return;
      }
      if ((event.key === 'r' || event.key === 'R') && onRetry) {
        event.preventDefault();
        onRetry();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onStop, onRetry, enabled]);
}
