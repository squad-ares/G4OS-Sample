/**
 * Bootstrap do Debug HUD.
 *
 * Compõe `DebugHudAggregator` + `DebugHudWindow` + IPC handlers
 * (`debug-hud:load-config`, `debug-hud:save-config`).
 *
 * Em vez de gate build-time, este módulo é sempre carregado mas começa
 * com `enabled` lido do `PreferencesStore`. Default:
 *   - dev (`!app.isPackaged`): true (HUD aparece logo de cara)
 *   - prod: false (usuário ativa em Settings > Modo de Reparo)
 *
 * `setEnabled(true)` registra o atalho global, abre janela na primeira
 * chamada (ou no proximo toggle). `setEnabled(false)` remove o atalho
 * e fecha a janela. Reactive — `RepairCategory` UI altera setting via
 * tRPC e o main reage sem restart.
 *
 * Usa dynamic import de `electron` para acessar `ipcMain`/`globalShortcut`/
 * `BrowserWindow` reais — fora do contrato `ElectronRuntime` (que é
 * minimalista para suportar testes). Falha de import vira no-op silencioso
 * (cenário esperado em testes sem Electron).
 */

import { createLogger } from '@g4os/kernel/logger';
import type { ListenerLeakDetector } from '@g4os/observability/memory';
import { DebugHudAggregator } from './aggregator.ts';
import { DebugHudWindow } from './window.ts';

const log = createLogger('debug-hud');

export interface DebugHudRuntime {
  readonly aggregator: DebugHudAggregator;
  readonly window: DebugHudWindow | null;
  /** Estado atual — UI consulta para alinhar toggle visual. */
  isEnabled(): boolean;
  /** Liga/desliga em tempo real. Quando `false`, fecha janela aberta + remove atalho. */
  setEnabled(enabled: boolean): Promise<void>;
  /** Atalho `Cmd/Ctrl+Shift+D` chama isso — só faz algo se `enabled`. */
  toggle(): Promise<void>;
  dispose(): void;
}

export interface CreateDebugHudOptions {
  readonly preloadPath: string;
  readonly rendererUrl: string;
  /** Estado inicial vindo do `PreferencesStore`. */
  readonly initialEnabled: boolean;
  /**
   * Detector de listener leak compartilhado com o `observability-runtime`.
   * Quando passado, o card 17-05 mostra dados reais; sem ele, fica zerado.
   */
  readonly listenerDetector?: ListenerLeakDetector;
  /**
   * Provider de turnos ativos (TurnDispatcher). Aggregator
   * pull-based — chama `snapshotActive()` por tick.
   */
  readonly activeTurnsProvider?: {
    snapshotActive(): readonly { sessionId: string; turnId: string; startedAt: number }[];
  };
}

export async function createDebugHudRuntime(
  options: CreateDebugHudOptions,
): Promise<DebugHudRuntime> {
  const electron = await loadElectronModule();
  const aggregator = new DebugHudAggregator({
    ...(options.listenerDetector ? { listenerDetector: options.listenerDetector } : {}),
    ...(options.activeTurnsProvider ? { activeTurnsProvider: options.activeTurnsProvider } : {}),
  });

  if (!electron) {
    log.info({}, 'electron unavailable; debug HUD disabled');
    return {
      aggregator,
      window: null,
      isEnabled: () => false,
      setEnabled: () => Promise.resolve(),
      toggle: () => Promise.resolve(),
      dispose: () => aggregator.dispose(),
    };
  }

  const window = new DebugHudWindow({
    browserWindowFactory: electron.BrowserWindow,
    preloadPath: options.preloadPath,
    rendererUrl: options.rendererUrl,
    aggregator,
  });

  // IPC handlers para a janela do HUD ler/salvar config — sempre
  // disponíveis (cheap), independente de enabled.
  electron.ipcMain.handle('debug-hud:load-config', () => window.loadConfig());
  electron.ipcMain.handle('debug-hud:save-config', (_event, payload: unknown) => {
    if (payload === null || typeof payload !== 'object') return Promise.resolve();
    return window.saveConfig(payload as never);
  });

  // Captura local — TS perde o narrowing dentro de closures. `electron`
  // já passou pelo guard early-return acima, então aqui é seguro.
  const electronModule = electron;
  const accelerator = 'CommandOrControl+Shift+D';
  let enabled = false;
  let shortcutRegistered = false;

  function registerShortcut(): void {
    if (shortcutRegistered) return;
    const ok = electronModule.globalShortcut.register(accelerator, () => {
      if (!enabled) return;
      void window.toggle().catch((cause) => log.warn({ err: cause }, 'toggle failed'));
    });
    if (!ok) {
      log.warn({ accelerator }, 'failed to register debug HUD shortcut');
      return;
    }
    shortcutRegistered = true;
  }

  function unregisterShortcut(): void {
    if (!shortcutRegistered) return;
    electronModule.globalShortcut.unregister(accelerator);
    shortcutRegistered = false;
  }

  function setEnabled(value: boolean): Promise<void> {
    if (value === enabled) return Promise.resolve();
    enabled = value;
    if (enabled) {
      registerShortcut();
      log.info({ accelerator }, 'debug HUD enabled');
    } else {
      unregisterShortcut();
      // Fecha janela aberta — usuário desligou. `close()` (não `dispose()`)
      // permite reabrir via setEnabled(true) sem restart.
      try {
        window.close();
      } catch (cause) {
        log.warn({ err: cause }, 'failed to close HUD window after disable');
      }
      log.info({}, 'debug HUD disabled');
    }
    return Promise.resolve();
  }

  // Estado inicial — apenas registra atalho se preciso.
  await setEnabled(options.initialEnabled);

  return {
    aggregator,
    window,
    isEnabled: () => enabled,
    setEnabled,
    toggle: () => (enabled ? window.toggle() : Promise.resolve()),
    dispose: () => {
      try {
        unregisterShortcut();
        electronModule.ipcMain.removeHandler('debug-hud:load-config');
        electronModule.ipcMain.removeHandler('debug-hud:save-config');
      } catch (cause) {
        log.warn({ err: cause }, 'electron cleanup failed during HUD dispose');
      }
      window.dispose();
      aggregator.dispose();
    },
  };
}

interface ElectronHudModule {
  readonly BrowserWindow: typeof import('electron').BrowserWindow;
  readonly ipcMain: typeof import('electron').ipcMain;
  readonly globalShortcut: typeof import('electron').globalShortcut;
}

async function loadElectronModule(): Promise<ElectronHudModule | null> {
  try {
    const specifier = 'electron';
    const mod = (await import(/* @vite-ignore */ specifier)) as typeof import('electron');
    if (!mod.BrowserWindow || !mod.ipcMain || !mod.globalShortcut) return null;
    return {
      BrowserWindow: mod.BrowserWindow,
      ipcMain: mod.ipcMain,
      globalShortcut: mod.globalShortcut,
    };
  } catch (cause) {
    log.debug({ err: cause }, 'electron module unavailable');
    return null;
  }
}

export type { DebugHudAggregator, HudSnapshot, MemorySnapshot } from './aggregator.ts';
export type { HudPersistedState } from './state.ts';
