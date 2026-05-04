/**
 * Tray icon + system menu. Adiciona ícone na bandeja do OS (menu bar
 * macOS, system tray Windows/Linux) com menu rápido pra ações comuns:
 * Show window, New turn, Settings, Quit.
 *
 * Não-bloqueante no boot: se Electron `Tray`/`Menu` API não está
 * disponível (web/headless test), retorna um disposable noop. Falhas de
 * carregamento de icon viram warning; tray ainda é usable sem visual.
 *
 * Lifecycle: criado no boot, disposed no `lifecycle.onQuit`. `Tray`
 * precisa ser referenciado pra não ser GC'd — main service mantém handle.
 */

import type { IDisposable } from '@g4os/kernel/disposable';
import { toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type { BrowserWindowInstance } from './electron-runtime.ts';

const log = createLogger('tray-service');

interface ElectronTrayLike {
  setToolTip(text: string): void;
  setContextMenu(menu: ElectronMenuLike): void;
  on(event: 'click' | 'right-click', handler: () => void): void;
  destroy(): void;
}

// F-CR51-22: substituir marker `_isMenu: never` por type alias mínimo.
// O cast `as never` em index.ts era workaround para este marker opaco —
// type alias vazio é mais idiomático e não requer cast. ADR-0002.
type ElectronMenuLike = Record<string, never>;

interface ElectronMenuModule {
  buildFromTemplate(template: ReadonlyArray<Record<string, unknown>>): ElectronMenuLike;
}

interface ElectronTrayCtor {
  new (image: string): ElectronTrayLike;
}

export interface TrayServiceDeps {
  readonly Tray: ElectronTrayCtor;
  readonly Menu: ElectronMenuModule;
  readonly app: { quit(): void };
  readonly iconPath: string | undefined;
  readonly getMainWindow: () => BrowserWindowInstance | null;
  /**
   * Hook chamado quando user pede "New turn" via menu. Mesma semântica
   * do Cmd+Shift+N global shortcut — emite IPC pro renderer focar
   * composer.
   */
  readonly onNewTurn?: () => void;
  /** Hook pra "Settings" — abre janela de settings ou navega rota. */
  readonly onOpenSettings?: () => void;
}

export interface TrayService extends IDisposable {
  readonly tray: ElectronTrayLike;
}

/**
 * Cria tray + context menu. Retorna `null` se ícone não está disponível
 * (env de dev sem icon resolvido). Caller decide se loga warn ou skipa.
 */
export function createTrayService(deps: TrayServiceDeps): TrayService | null {
  if (!deps.iconPath) {
    log.warn('tray: icon path unavailable — skipping tray creation');
    return null;
  }

  let tray: ElectronTrayLike;
  try {
    tray = new deps.Tray(deps.iconPath);
  } catch (cause) {
    log.warn({ err: cause, iconPath: deps.iconPath }, 'tray creation failed');
    return null;
  }

  tray.setToolTip('G4 OS');

  const showWindow = (): void => {
    const win = deps.getMainWindow();
    if (!win) return;
    const w = win as { isVisible?: () => boolean; show?: () => void; focus?: () => void };
    if (!w.isVisible?.()) w.show?.();
    w.focus?.();
  };

  const template: ReadonlyArray<Record<string, unknown>> = [
    {
      label: 'Show G4 OS',
      click: showWindow,
    },
    {
      label: 'New turn',
      accelerator: 'CommandOrControl+Shift+N',
      click: () => {
        showWindow();
        deps.onNewTurn?.();
      },
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        showWindow();
        deps.onOpenSettings?.();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit G4 OS',
      accelerator: 'CommandOrControl+Q',
      click: () => deps.app.quit(),
    },
  ];

  const menu = deps.Menu.buildFromTemplate(template);
  tray.setContextMenu(menu);

  // Click no ícone (Windows/Linux) toggle window. macOS abre o menu por
  // default, então o handler é redundante mas inofensivo.
  tray.on('click', () => {
    const win = deps.getMainWindow();
    if (!win) return;
    const w = win as { isVisible?: () => boolean; hide?: () => void; show?: () => void };
    if (w.isVisible?.()) w.hide?.();
    else {
      w.show?.();
      win.focus();
    }
  });

  log.info('tray service ready');

  return Object.assign(
    toDisposable(() => {
      try {
        tray.destroy();
      } catch (cause) {
        log.warn({ err: cause }, 'tray destroy failed');
      }
    }),
    { tray },
  ) as TrayService;
}
