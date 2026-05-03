/**
 * Handlers das ações diagnósticas/destrutivas do Debug HUD.
 *
 * Cada ação retorna `ActionResult` (`{ ok, messageKey?, params?, path? }`)
 * para o renderer mostrar feedback inline. Falhas inesperadas viram
 * `{ ok: false, messageKey: ..., params: { detail } }` — nunca throw via IPC.
 *
 * Strings nunca são montadas no main: handlers retornam apenas
 * `TranslationKey`s e parâmetros. Renderer chama `t(key, params)`.
 *
 * Ações disponíveis:
 *   - force-gc: invoca `global.gc()` se disponível (`--expose-gc`)
 *   - cancel-turn / cancel-all-turns: usa TurnDispatcher
 *   - reset-listeners: zera o ListenerLeakDetector
 *   - clear-logs: limpa o ring buffer do aggregator
 *   - export-diagnostic: chama `exportDebugInfo` e abre Save Dialog
 *   - reload-renderer: `mainWindow.webContents.reload()`
 *
 * Cada dependência é injetada via `ActionDeps`. Sem ela, ação retorna
 * `{ ok: false, messageKey: 'unavailable' }` em vez de quebrar.
 */

import type { ListenerLeakDetector } from '@g4os/observability/memory';
import type { DebugHudAggregator } from './aggregator.ts';

/**
 * Resultado tipado da ação. `messageKey` é uma string opaca que o
 * renderer mapeia em TranslationKey (definimos como string aqui pra
 * evitar dep do `@g4os/translate` no main process — chaves são
 * constantes documentadas em `ACTION_RESULT_KEYS` abaixo).
 */
export interface ActionResult {
  readonly ok: boolean;
  readonly messageKey?: string;
  readonly params?: Record<string, string | number>;
  readonly path?: string;
}

/**
 * Contrato mínimo do TurnDispatcher para as ações de cancelamento.
 * `interrupt` retorna Result do neverthrow; o handler trata sync.
 */
export interface TurnDispatcherLike {
  snapshotActive(): readonly { sessionId: string; turnId: string; startedAt: number }[];
  interrupt(sessionId: string): { isOk(): boolean; error?: { message?: string } };
}

export interface ActionDeps {
  readonly aggregator: DebugHudAggregator;
  readonly listenerDetector?: ListenerLeakDetector;
  readonly turnDispatcher?: TurnDispatcherLike;
  /**
   * Recarrega a janela principal (`mainWindow.webContents.reload()`).
   * Composition root passa um closure porque a window pode ser
   * recriada durante a vida útil do HUD.
   */
  readonly reloadMainWindow?: () => void;
  /**
   * Roda a exportação de diagnóstico (ZIP) e retorna o caminho final.
   * Composition root injeta a função pra evitar acoplamento com Electron
   * dialog + DebugExportSystemInfo + config — tudo conhecido só no main.
   * Retorna `null` se usuário cancelou; lança em falha real.
   */
  readonly exportDiagnostic?: () => Promise<string | null>;
}

const NA = (action: string): ActionResult => ({
  ok: false,
  messageKey: 'debugHud.action.error.unavailable',
  params: { action },
});

function describeError(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

interface NodeWithGc {
  gc?: () => void;
}

export async function handleAction(
  action: string,
  payload: unknown,
  deps: ActionDeps,
): Promise<ActionResult> {
  switch (action) {
    case 'force-gc': {
      const g = globalThis as NodeWithGc;
      if (typeof g.gc !== 'function') {
        return { ok: false, messageKey: 'debugHud.action.error.gcMissing' };
      }
      try {
        g.gc();
        return { ok: true, messageKey: 'debugHud.action.success.gc' };
      } catch (cause) {
        return {
          ok: false,
          messageKey: 'debugHud.action.error.gcMissing',
          params: { detail: describeError(cause) },
        };
      }
    }

    case 'cancel-turn': {
      if (!deps.turnDispatcher) return NA(action);
      // F-CR31-3: validar tipo string antes de coercir. `String(null) → "null"`
      // passa pelo length-check mas falha downstream em interrupt.
      const raw =
        payload && typeof payload === 'object' && 'sessionId' in payload
          ? (payload as { sessionId: unknown }).sessionId
          : undefined;
      if (typeof raw !== 'string' || raw.length === 0) {
        return { ok: false, messageKey: 'debugHud.action.error.sessionRequired' };
      }
      const result = deps.turnDispatcher.interrupt(raw);
      if (result.isOk()) {
        return {
          ok: true,
          messageKey: 'debugHud.action.success.cancelTurn',
          params: { sessionId: raw.slice(0, 8) },
        };
      }
      return { ok: false, messageKey: 'debugHud.action.error.cancelTurn' };
    }

    case 'cancel-all-turns': {
      if (!deps.turnDispatcher) return NA(action);
      const active = deps.turnDispatcher.snapshotActive();
      if (active.length === 0) {
        return { ok: true, messageKey: 'debugHud.action.success.cancelAllNone' };
      }
      let okCount = 0;
      let failedCount = 0;
      for (const row of active) {
        const r = deps.turnDispatcher.interrupt(row.sessionId);
        if (r.isOk()) okCount += 1;
        else failedCount += 1;
      }
      if (failedCount === 0) {
        return {
          ok: true,
          messageKey: 'debugHud.action.success.cancelAllOk',
          params: { count: okCount },
        };
      }
      return {
        ok: false,
        messageKey: 'debugHud.action.error.cancelAllPartial',
        params: { ok: okCount, failed: failedCount },
      };
    }

    case 'reset-listeners': {
      if (!deps.listenerDetector) return NA(action);
      // F-CR31-2: ListenerLeakDetector não expõe `reset()` público — re-
      // instanciar via composition root é caro e exige reinjeção em todos
      // os subscribers. Reportamos honestamente que reset não é suportado
      // e direcionamos pro workaround real (force-gc); UX do toast fica
      // honesto (vermelho/atenção) em vez de fingir sucesso.
      return { ok: false, messageKey: 'debugHud.action.error.resetListenersUnsupported' };
    }

    case 'clear-logs': {
      deps.aggregator.clearLogBuffer();
      return { ok: true, messageKey: 'debugHud.action.success.clearLogs' };
    }

    case 'export-diagnostic': {
      if (!deps.exportDiagnostic) return NA(action);
      try {
        const target = await deps.exportDiagnostic();
        if (!target) {
          return { ok: false, messageKey: 'debugHud.report.dialogCanceled' };
        }
        return { ok: true, messageKey: 'debugHud.action.success.exportDiagnostic', path: target };
      } catch (cause) {
        return {
          ok: false,
          messageKey: 'debugHud.report.diagFail',
          params: { detail: describeError(cause) },
        };
      }
    }

    case 'reload-renderer': {
      if (!deps.reloadMainWindow) return NA(action);
      try {
        deps.reloadMainWindow();
        return { ok: true, messageKey: 'debugHud.action.success.reloadRenderer' };
      } catch (cause) {
        return {
          ok: false,
          messageKey: 'debugHud.report.diagFail',
          params: { detail: describeError(cause) },
        };
      }
    }

    default:
      return { ok: false, messageKey: 'debugHud.action.error.unknownAction', params: { action } };
  }
}
