/**
 * DebugHudWindow — BrowserWindow frameless + alwaysOnTop para o Debug HUD.
 *
 * Decisões de design:
 *   - Janela separada (não overlay no main) — sobrevive a crash do
 *     renderer principal, posicionável em outro monitor.
 *   - Frameless + transparent + alwaysOnTop + skipTaskbar.
 *   - Estado (bounds + opacity) persistido em `<appPaths.config>/debug-hud.json`.
 *   - Preload dedicado expõe apenas `window.debugHud` via contextBridge.
 *
 * Lifecycle:
 *   - `toggle()` cria a janela na primeira chamada, esconde/mostra depois.
 *   - `subscribeAggregator(aggregator)` conecta o stream de snapshots.
 *   - `dispose()` fecha a janela e limpa listeners.
 *
 * Implementação usa o `BrowserWindow` real do `electron` via dynamic
 * import — não passa pelo contrato `ElectronRuntime` (que é minimalista
 * pra testes). Isso é seguro porque o HUD só roda em dev/builds com a
 * flag `G4OS_DEBUG_HUD_ENABLED=1` ligada, nunca em E2E.
 */

import type { IDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type { BrowserWindow as RealBrowserWindow } from 'electron';
import type { DebugHudAggregator, HudSnapshot } from './aggregator.ts';
import { HUD_DEFAULT_STATE, type HudPersistedState, loadHudState, saveHudState } from './state.ts';

const log = createLogger('debug-hud-window');

export interface DebugHudWindowOptions {
  readonly browserWindowFactory: typeof import('electron').BrowserWindow;
  readonly preloadPath: string;
  readonly rendererUrl: string;
  readonly aggregator: DebugHudAggregator;
}

export class DebugHudWindow implements IDisposable {
  private window: RealBrowserWindow | null = null;
  private aggregatorSubscription: IDisposable | null = null;
  private state: HudPersistedState = HUD_DEFAULT_STATE;
  private disposed = false;

  constructor(private readonly options: DebugHudWindowOptions) {}

  async toggle(): Promise<void> {
    if (this.disposed) return;
    if (this.window && !this.window.isDestroyed()) {
      if (this.window.isVisible()) this.window.hide();
      else this.window.show();
      return;
    }
    await this.open();
  }

  async open(): Promise<void> {
    if (this.disposed) return;
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      return;
    }

    this.state = await loadHudState();
    const { browserWindowFactory: BrowserWindow } = this.options;

    // Frame nativo (drag + close + min/max grátis), alwaysOnTop=false
    // pra não roubar foco da janela principal.
    const w = new BrowserWindow({
      x: this.state.bounds.x,
      y: this.state.bounds.y,
      width: this.state.bounds.width,
      height: this.state.bounds.height,
      frame: true,
      alwaysOnTop: false,
      resizable: true,
      backgroundColor: '#0c1018',
      title: 'G4 OS Debug HUD',
      webPreferences: {
        preload: this.options.preloadPath,
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
      },
    });
    this.window = w;
    w.setOpacity(this.state.opacity);

    w.on('move', () => void this.persistBounds());
    w.on('resize', () => void this.persistBounds());
    w.on('closed', () => {
      this.aggregatorSubscription?.dispose();
      this.aggregatorSubscription = null;
      this.window = null;
    });

    this.aggregatorSubscription = this.options.aggregator.subscribe((snapshot) => {
      this.send(snapshot);
    });

    try {
      await w.loadURL(this.options.rendererUrl);
      log.info({ url: this.options.rendererUrl }, 'debug HUD opened');
    } catch (cause) {
      log.warn({ err: cause }, 'failed to load debug HUD URL');
    }
  }

  loadConfig(): Promise<HudPersistedState> {
    return Promise.resolve(this.state);
  }

  async saveConfig(state: HudPersistedState): Promise<void> {
    this.state = state;
    await saveHudState(state);
  }

  /**
   * Fecha a janela mas mantém o objeto utilizável — pode ser reaberto
   * via `open()` depois. Use quando o HUD é desligado pelo user em
   * Settings e pode ser religado sem restart.
   */
  close(): void {
    if (this.disposed) return;
    this.aggregatorSubscription?.dispose();
    this.aggregatorSubscription = null;
    if (this.window && !this.window.isDestroyed()) this.window.close();
    this.window = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.aggregatorSubscription?.dispose();
    this.aggregatorSubscription = null;
    if (this.window && !this.window.isDestroyed()) this.window.close();
    this.window = null;
  }

  private send(snapshot: HudSnapshot): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.window.webContents.send('debug-hud:snapshot', snapshot);
  }

  private async persistBounds(): Promise<void> {
    if (!this.window || this.window.isDestroyed()) return;
    const bounds = this.window.getBounds();
    this.state = {
      ...this.state,
      bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      opacity: this.window.getOpacity(),
    };
    await saveHudState(this.state);
  }
}
