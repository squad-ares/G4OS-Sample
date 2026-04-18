/**
 * CRUD mínimo de janelas Electron. O main apenas orquestra a criação e
 * a lista viva; regras de negócio (estado da sessão, layout de abas)
 * vivem em pacotes de feature.
 */

import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type {
  BrowserWindowInstance,
  BrowserWindowOptions,
  ElectronRuntime,
} from './electron-runtime.ts';

const log = createLogger('window-manager');

const DEFAULT_WIDTH = 1280;
const DEFAULT_HEIGHT = 800;

export interface OpenWindowOptions {
  readonly url?: string;
  readonly preloadPath?: string;
  readonly width?: number;
  readonly height?: number;
}

export class WindowManager extends DisposableBase {
  private readonly windows = new Set<BrowserWindowInstance>();

  constructor(private readonly runtime: ElectronRuntime) {
    super();
  }

  async open(options: OpenWindowOptions = {}): Promise<BrowserWindowInstance> {
    const windowOptions: BrowserWindowOptions = {
      width: options.width ?? DEFAULT_WIDTH,
      height: options.height ?? DEFAULT_HEIGHT,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        ...(options.preloadPath ? { preload: options.preloadPath } : {}),
      },
    };

    const win = new this.runtime.BrowserWindow(windowOptions);
    this.windows.add(win);
    this._register(
      toDisposable(() => {
        if (!win.isDestroyed()) win.close();
        this.windows.delete(win);
      }),
    );

    if (options.url) {
      try {
        await win.loadURL(options.url);
      } catch (err) {
        log.error({ err, url: options.url }, 'failed to load url');
      }
    }

    return win;
  }

  list(): readonly BrowserWindowInstance[] {
    return Array.from(this.windows);
  }
}
