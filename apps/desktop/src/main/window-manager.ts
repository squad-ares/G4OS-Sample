import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { writeAtomic } from '@g4os/kernel/fs';
import { createLogger } from '@g4os/kernel/logger';
import { getAppPaths, isLinux, isMacOS, isWindows } from '@g4os/platform';
import type {
  BrowserWindowInstance,
  BrowserWindowOptions,
  ElectronRuntime,
} from './electron-runtime.ts';

const log = createLogger('window-manager');

const DEFAULT_WIDTH = 1420;
const DEFAULT_HEIGHT = 900;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const WINDOW_BACKGROUND_COLOR = '#0B0B0F';

interface WindowBounds {
  readonly width: number;
  readonly height: number;
  readonly x?: number;
  readonly y?: number;
}

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

export class WindowManager extends DisposableBase {
  private readonly windows = new Set<BrowserWindowInstance>();
  private readonly byWorkspace = new Map<string, BrowserWindowInstance>();
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

    const bounds = await this.loadBounds(workspaceId);
    const win = this.createWindow({ ...bounds }, { preloadPath });
    this.byWorkspace.set(workspaceId, win);

    await this.load(win, { url: appendWorkspaceId(rendererUrl, workspaceId) });

    const w = win as BoundsableWindow;
    const onClose = () => {
      void this.saveBounds(
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

    this.windows.add(win);
    this._register(
      toDisposable(() => {
        if (!win.isDestroyed()) win.close();
        this.windows.delete(win);
      }),
    );

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

  private statePath(workspaceId: string): string {
    return join(this.stateDir, `${workspaceId}.json`);
  }

  private async loadBounds(workspaceId: string): Promise<WindowBounds> {
    try {
      const raw = await readFile(this.statePath(workspaceId), 'utf-8');
      const parsed = JSON.parse(raw) as WindowBounds;
      return {
        width: parsed.width ?? DEFAULT_WIDTH,
        height: parsed.height ?? DEFAULT_HEIGHT,
        ...(parsed.x === undefined ? {} : { x: parsed.x }),
        ...(parsed.y === undefined ? {} : { y: parsed.y }),
      };
    } catch {
      return { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
    }
  }

  private async saveBounds(
    workspaceId: string,
    bounds: { x: number; y: number; width: number; height: number },
  ): Promise<void> {
    try {
      const data: WindowBounds = {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
      };
      const path = this.statePath(workspaceId);
      // CR9: substitui `writeFile` direto por `writeAtomic` (tmp+fsync+rename).
      // Antes, crash mid-write deixava arquivo parcial; próximo `loadBounds`
      // recuperava via catch ENOENT-like, mas o JSON corrompido permanecia
      // no disco até saveBounds próximo. Atomic rename é gratuito (já é
      // padrão do projeto para credentials/permissions/sources).
      await mkdir(dirname(path), { recursive: true });
      await writeAtomic(path, JSON.stringify(data));
    } catch (err) {
      log.warn({ err, workspaceId }, 'failed to save window bounds');
    }
  }
}

function appendWorkspaceId(url: string, workspaceId: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}workspaceId=${encodeURIComponent(workspaceId)}`;
}
