/**
 * Hook que expõe as ações destrutivas/diagnósticas do HUD via
 * `window.debugHud.invoke`. Cada ação retorna um `ActionResult` com
 * status + `messageKey` (TranslationKey opaca) + `params` para o renderer
 * mostrar feedback (toast/inline) localizado.
 *
 * Bridge é injetado pelo preload (`preload-debug-hud.ts`) — fora dele,
 * todas ações viram no-ops com `{ ok: false, messageKey: 'unavailable' }`
 * para que o renderer continue funcional em testes/iframe-preview.
 */

import { useCallback } from 'react';

export interface ActionResult {
  readonly ok: boolean;
  readonly messageKey?: string;
  readonly params?: Record<string, string | number>;
  readonly path?: string;
}

export interface HudActions {
  readonly forceGc: () => Promise<ActionResult>;
  readonly cancelTurn: (sessionId: string) => Promise<ActionResult>;
  readonly cancelAllTurns: () => Promise<ActionResult>;
  readonly resetListeners: () => Promise<ActionResult>;
  readonly clearLogs: () => Promise<ActionResult>;
  readonly exportDiagnostic: () => Promise<ActionResult>;
  readonly reloadRenderer: () => Promise<ActionResult>;
}

const NOT_AVAILABLE: ActionResult = {
  ok: false,
  messageKey: 'debugHud.action.error.unavailable',
  params: { action: 'bridge' },
};

function invoke(action: string, payload?: unknown): Promise<ActionResult> {
  if (!window.debugHud?.invoke) return Promise.resolve(NOT_AVAILABLE);
  return window.debugHud.invoke(action, payload) as Promise<ActionResult>;
}

export function useHudActions(): HudActions {
  const forceGc = useCallback((): Promise<ActionResult> => invoke('force-gc'), []);
  const cancelTurn = useCallback(
    (sessionId: string): Promise<ActionResult> => invoke('cancel-turn', { sessionId }),
    [],
  );
  const cancelAllTurns = useCallback((): Promise<ActionResult> => invoke('cancel-all-turns'), []);
  const resetListeners = useCallback((): Promise<ActionResult> => invoke('reset-listeners'), []);
  const clearLogs = useCallback((): Promise<ActionResult> => invoke('clear-logs'), []);
  const exportDiagnostic = useCallback(
    (): Promise<ActionResult> => invoke('export-diagnostic'),
    [],
  );
  const reloadRenderer = useCallback((): Promise<ActionResult> => invoke('reload-renderer'), []);

  return {
    forceGc,
    cancelTurn,
    cancelAllTurns,
    resetListeners,
    clearLogs,
    exportDiagnostic,
    reloadRenderer,
  };
}
