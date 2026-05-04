import { join } from 'node:path';
import { DisposableBase, type IDisposable, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import { getAppPaths, isLinux, isMacOS, isWindows } from '@g4os/platform';
import type {
  BrowserWindowInstance,
  BrowserWindowOptions,
  ElectronRuntime,
} from './electron-runtime.ts';
import { loadWindowBounds, saveWindowBounds, type WindowBounds } from './window-bounds.ts';

const log = createLogger('window-manager');

const DEFAULT_WIDTH = 1420;
const DEFAULT_HEIGHT = 900;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const WINDOW_BACKGROUND_COLOR = '#0B0B0F';

export interface OpenWindowOptions {
  readonly url?: string;
  readonly preloadPath?: string;
  readonly width?: number;
  readonly height?: number;
  readonly openDevTools?: boolean;
}

interface BoundsableWindow extends BrowserWindowInstance {
  getBounds?(): { x: number; y: number; width: number; height: number };
  once?(event: 'ready-to-show', listener: () => void): void;
  show?(): void;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  off?(event: string, listener: (...args: unknown[]) => void): void;
}

export interface WindowManagerOptions {
  readonly stateDir?: string;
  readonly iconPath?: string;
  readonly defaultPreloadPath?: string;
  readonly defaultRendererUrl?: string;
}

export type WindowCreatedListener = (win: BrowserWindowInstance) => void;

export class WindowManager extends DisposableBase {
  private readonly windows = new Set<BrowserWindowInstance>();
  private readonly byWorkspace = new Map<string, BrowserWindowInstance>();
  private readonly windowCreatedListeners = new Set<WindowCreatedListener>();
  private readonly stateDir: string;
  private readonly iconPath: string | undefined;
  private defaultPreloadPath: string | undefined;
  private defaultRendererUrl: string | undefined;

  constructor(
    private readonly runtime: ElectronRuntime,
    options: WindowManagerOptions = {},
  ) {
    super();
    this.stateDir = options.stateDir ?? join(getAppPaths().state, 'windows');
    this.iconPath = options.iconPath;
    this.defaultPreloadPath = options.defaultPreloadPath;
    this.defaultRendererUrl = options.defaultRendererUrl;
  }

  setDefaults(defaults: { readonly preloadPath?: string; readonly rendererUrl?: string }): void {
    if (defaults.preloadPath !== undefined) this.defaultPreloadPath = defaults.preloadPath;
    if (defaults.rendererUrl !== undefined) this.defaultRendererUrl = defaults.rendererUrl;
  }

  async openForWorkspace(
    workspaceId: string,
    overrides: { readonly preloadPath?: string; readonly rendererUrl?: string } = {},
  ): Promise<BrowserWindowInstance> {
    const existing = this.byWorkspace.get(workspaceId);
    if (existing && existing.isDestroyed() === false) {
      (existing as BoundsableWindow).show?.();
      existing.focus();
      return existing;
    }

    const preloadPath = overrides.preloadPath ?? this.defaultPreloadPath;
    const rendererUrl = overrides.rendererUrl ?? this.defaultRendererUrl;
    if (!preloadPath || !rendererUrl) {
      throw new Error(
        'WindowManager.openForWorkspace requires preloadPath and rendererUrl (pass via setDefaults or overrides).',
      );
    }

    const bounds = await loadWindowBounds(this.stateDir, workspaceId);
    const win = this.createWindow({ ...bounds }, { preloadPath });
    this.byWorkspace.set(workspaceId, win);

    await this.load(win, { url: appendWorkspaceId(rendererUrl, workspaceId) });

    const w = win as BoundsableWindow;
    const onClose = () => {
      void saveWindowBounds(
        this.stateDir,
        workspaceId,
        w.getBounds?.() ?? { x: 0, y: 0, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
      );
    };
    const onClosed = () => {
      this.byWorkspace.delete(workspaceId);
    };
    w.on?.('close', onClose);
    w.on?.('closed', onClosed);
    this._register(
      toDisposable(() => {
        w.off?.('close', onClose);
        w.off?.('closed', onClosed);
      }),
    );

    return win;
  }

  create(options: OpenWindowOptions = {}): Promise<BrowserWindowInstance> {
    const bounds: WindowBounds = {
      width: options.width ?? DEFAULT_WIDTH,
      height: options.height ?? DEFAULT_HEIGHT,
    };
    return Promise.resolve(this.createWindow(bounds, options));
  }

  open(options: OpenWindowOptions = {}): Promise<BrowserWindowInstance> {
    const bounds: WindowBounds = {
      width: options.width ?? DEFAULT_WIDTH,
      height: options.height ?? DEFAULT_HEIGHT,
    };
    return this.createAndLoadWindow(bounds, options);
  }

  list(): readonly BrowserWindowInstance[] {
    return Array.from(this.windows);
  }

  /**
   * Retorna a janela principal — primeira janela criada pelo bootstrap.
   * F-CR31-7: callers que querem "a main" devem usar este método em vez
   * de `list()[0]` — o array `list()` contém qualquer janela criada via
   * `create()` (incluindo workspace/multi-window), e a ordem não é
   * garantida em cenários de boot com deep-link concorrente.
   *
   * Implementação atual: retorna a primeira do `Set` (preserva ordem de
   * inserção em JS), o que coincide com a main em prática. Tornar isso
   * explícito via método dedicado evita drift e documenta a intenção.
   */
  getMain(): BrowserWindowInstance | undefined {
    const iter = this.windows.values();
    const first = iter.next();
    return first.done ? undefined : first.value;
  }

  /**
   * Inscreve um listener disparado a cada janela criada (após o
   * `createWindow` ter populado `windows`). Usado pelo IPC server pra
   * registrar cleanup de subscriptions órfãs em `did-start-navigation` /
   * `destroyed` de janelas que aparecem depois do boot — multi-window
   * via `WindowsService.openWorkspaceWindow`, deep-link, debug-hud.
   *
   * Listener corre síncrono — não jogue I/O caro aqui.
   */
  onWindowCreated(listener: WindowCreatedListener): IDisposable {
    this.windowCreatedListeners.add(listener);
    return toDisposable(() => {
      this.windowCreatedListeners.delete(listener);
    });
  }

  async load(win: BrowserWindowInstance, options: Pick<OpenWindowOptions, 'url' | 'openDevTools'>) {
    if (!options.url) return;

    try {
      await win.loadURL(options.url);
      if (options.openDevTools) {
        win.webContents.openDevTools({ mode: 'detach' });
      }
    } catch (err) {
      log.error({ err, url: options.url }, 'failed to load url');
    }
  }

  private async createAndLoadWindow(
    bounds: WindowBounds,
    options: OpenWindowOptions = {},
  ): Promise<BrowserWindowInstance> {
    const win = this.createWindow(bounds, options);
    await this.load(win, options);
    return win;
  }

  private createWindow(
    bounds: WindowBounds,
    options: OpenWindowOptions = {},
  ): BrowserWindowInstance {
    const windowOptions: BrowserWindowOptions = {
      width: bounds.width,
      height: bounds.height,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      show: false,
      backgroundColor: WINDOW_BACKGROUND_COLOR,
      title: '',
      ...(this.iconPath ? { icon: this.iconPath } : {}),
      ...this.platformWindowOptions(),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        ...(options.preloadPath ? { preload: options.preloadPath } : {}),
      },
    };

    const win = new this.runtime.BrowserWindow(windowOptions);
    const w = win as BoundsableWindow;

    w.once?.('ready-to-show', () => {
      w.show?.();
    });

    // Em production: bloqueia Cmd+R / Ctrl+R / F5 (reload destrói estado
    // in-flight). Mantém ativo em dev pra HMR.
    if (this.runtime.app.isPackaged) {
      win.webContents.on('before-input-event', (e, input) => {
        if (input.type !== 'keyDown') return;
        const mod = input.meta || input.control;
        if ((mod && input.key.toLowerCase() === 'r') || input.key === 'F5') e.preventDefault();
      });
    }

    this.windows.add(win);
    this._register(
      toDisposable(() => {
        if (!win.isDestroyed()) win.close();
        this.windows.delete(win);
      }),
    );

    // Notifica listeners de pós-create. Erros num listener não devem
    // afetar criação da janela nem outros listeners — log + continua.
    for (const listener of this.windowCreatedListeners) {
      try {
        listener(win);
      } catch (cause) {
        log.warn({ err: cause }, 'window created listener threw; ignoring');
      }
    }

    return win;
  }

  private platformWindowOptions(): Partial<BrowserWindowOptions> {
    if (isMacOS()) {
      return {
        titleBarStyle: 'hiddenInset',
        trafficLightPosition: { x: 18, y: 18 },
        vibrancy: 'under-window',
        visualEffectState: 'active',
      };
    }
    if (isWindows()) {
      return {
        frame: true,
        autoHideMenuBar: true,
        backgroundMaterial: 'mica',
      };
    }
    if (isLinux()) {
      return {
        frame: true,
        autoHideMenuBar: true,
      };
    }
    return {};
  }
}

function appendWorkspaceId(url: string, workspaceId: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}workspaceId=${encodeURIComponent(workspaceId)}`;
}
