/**
 * Hook que escuta o atalho global Cmd+Shift+N.
 * Quando disparado, foca o composer textarea via DOM query — funciona
 * sem precisar de roteamento intermediário, basta ter um composer
 * montado na página atual.
 */

import { useEffect } from 'react';

interface G4osShortcutsBridge {
  onNewTurn(callback: () => void): () => void;
}

declare global {
  interface Window {
    g4osShortcuts?: G4osShortcutsBridge;
  }
}

export function useGlobalNewTurnShortcut(): void {
  useEffect(() => {
    const bridge = window.g4osShortcuts;
    if (!bridge) return;
    const unsubscribe = bridge.onNewTurn(() => {
      // Estratégia simples: foca o textarea do composer se houver. Sem
      // sessão ativa, nada acontece — evita criar fluxos zumbis.
      const textarea = document.querySelector<HTMLTextAreaElement>(
        '[data-composer-textarea="true"], textarea[role="combobox"]',
      );
      textarea?.focus();
    });
    return unsubscribe;
  }, []);
}
