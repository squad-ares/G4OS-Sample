/**
 * Global shortcuts registrados via Electron `globalShortcut`.
 * Diferente de keyboard shortcuts da renderer (limitados a quando a
 * janela tem foco), `globalShortcut` é OS-level — funciona com app em
 * background..
 *
 * Atalhos:
 *   - `CommandOrControl+Shift+N` → emite IPC `global:new-turn` pra renderer
 *     focar composer / criar sessão.
 *   - `CommandOrControl+Shift+W` → toggle visibilidade da main window.
 *
 * O atalho do Debug HUD (`CommandOrControl+Shift+D`) vive em
 * `debug-hud/index.ts` e não passa por aqui (lifecycle dele é diferente
 * — só ativo quando preference está ligada).
 */

import type { IDisposable } from '@g4os/kernel/disposable';
import { toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type { BrowserWindowInstance } from './electron-runtime.ts';

const log = createLogger('global-shortcuts');

const NEW_TURN_ACCELERATOR = 'CommandOrControl+Shift+N';
const TOGGLE_WINDOW_ACCELERATOR = 'CommandOrControl+Shift+W';

export const GLOBAL_NEW_TURN_CHANNEL = 'global:new-turn';

export interface GlobalShortcutsDeps {
  readonly globalShortcut: typeof import('electron').globalShortcut;
  readonly getMainWindow: () => BrowserWindowInstance | null;
}

/**
 * Registra os atalhos globais. Retorna disposable que faz unregister.
 * Falha silenciosamente em conflito (outro app já registrou) — usa
 * `register()` que retorna boolean, não lança.
 */
export function registerGlobalShortcuts(deps: GlobalShortcutsDeps): IDisposable {
  const registered: string[] = [];

  if (
    deps.globalShortcut.register(NEW_TURN_ACCELERATOR, () => {
      const win = deps.getMainWindow();
      if (!win) return;
      // Cast: BrowserWindowInstance no nosso runtime.ts não expõe
      // `webContents.send` — mas a impl real do Electron tem. Cast safe
      // pra evitar atravessar tipos do runtime mock.
      const wc = (win as { webContents?: { send?: (ch: string) => void } }).webContents;
      wc?.send?.(GLOBAL_NEW_TURN_CHANNEL);
      // Se janela está hidden, mostra junto pra usuário ver o composer
      const showable = win as { isVisible?: () => boolean; show?: () => void };
      if (showable.isVisible && !showable.isVisible()) showable.show?.();
      win.focus();
    })
  ) {
    registered.push(NEW_TURN_ACCELERATOR);
  } else {
    log.warn({ accelerator: NEW_TURN_ACCELERATOR }, 'failed to register new-turn shortcut');
  }

  if (
    deps.globalShortcut.register(TOGGLE_WINDOW_ACCELERATOR, () => {
      const win = deps.getMainWindow();
      if (!win) return;
      const w = win as {
        isVisible?: () => boolean;
        hide?: () => void;
        show?: () => void;
        focus?: () => void;
      };
      if (w.isVisible?.()) {
        w.hide?.();
      } else {
        w.show?.();
        w.focus?.();
      }
    })
  ) {
    registered.push(TOGGLE_WINDOW_ACCELERATOR);
  } else {
    log.warn(
      { accelerator: TOGGLE_WINDOW_ACCELERATOR },
      'failed to register toggle-window shortcut',
    );
  }

  log.info({ registered }, 'global shortcuts registered');

  return toDisposable(() => {
    for (const accel of registered) {
      try {
        deps.globalShortcut.unregister(accel);
      } catch (cause) {
        log.warn({ accel, err: cause }, 'unregister failed');
      }
    }
  });
}
