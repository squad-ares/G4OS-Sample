/**
 * Bootstrap do processo principal do Electron.
 *
 * Carrega dependências de runtime do Electron dinamicamente para que o
 * pacote `@g4os/desktop` continue a fazer typecheck/lint mesmo antes do
 * workspace ter `electron` instalado. O runtime real é ligado quando o
 * Electron executa este módulo através do main entry.
 */

import { createIpcServer } from './ipc-server.ts';

export interface BootstrapOptions {
  readonly preloadPath?: string;
  readonly rendererUrl?: string;
}

export async function bootstrapMain(options: BootstrapOptions = {}): Promise<void> {
  const electron = await loadElectron();
  if (!electron) {
    // Estamos fora do runtime do Electron (ex.: vitest). Encerra silenciosamente.
    return;
  }

  const { app, BrowserWindow } = electron;

  await app.whenReady();

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      ...(options.preloadPath ? { preload: options.preloadPath } : {}),
    },
  });

  await createIpcServer({ windows: [mainWindow] });

  if (options.rendererUrl) {
    await mainWindow.loadURL(options.rendererUrl);
  }

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

interface ElectronRuntime {
  readonly app: {
    whenReady(): Promise<void>;
    quit(): void;
    on(event: 'window-all-closed', listener: () => void): void;
  };
  readonly BrowserWindow: new (
    options: unknown,
  ) => {
    loadURL(url: string): Promise<void>;
    readonly webContents: { readonly id: number };
  };
}

async function loadElectron(): Promise<ElectronRuntime | null> {
  try {
    // Import dinâmico evita resolução em tempo de compilação quando o
    // pacote ainda não está instalado (fase atual do scaffolding).
    const specifier = 'electron';
    const mod = (await import(/* @vite-ignore */ specifier)) as unknown;
    return mod as ElectronRuntime;
  } catch {
    return null;
  }
}
