import { useEffect } from 'react';

export interface SessionShortcutHandlers {
  readonly onStop?: () => void;
  readonly enabled?: boolean;
}

/**
 * Atalhos de teclado para ações de sessão:
 * Cmd+. (macOS) / Ctrl+. (outros) → stop turn atual.
 *
 * Cmd+R / Ctrl+R intencionalmente NÃO está bound aqui. Esse atalho colide
 * com a convenção universal de "recarregar página" e usuários apertam por
 * reflexo esperando reload — quando estava bound a `retryLastTurn`, isso
 * disparava ação destrutiva (trunca JSONL + redispatch) sem o usuário
 * perceber. Retry continua disponível pelos botões da UI.
 */
export function useSessionShortcuts({ onStop, enabled = true }: SessionShortcutHandlers): void {
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
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onStop, enabled]);
}
