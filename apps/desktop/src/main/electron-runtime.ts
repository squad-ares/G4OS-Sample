/**
 * Loader central do runtime do Electron e tipos mínimos usados pelos
 * serviços do main process.
 *
 * Mantemos interfaces locais para que o pacote `@g4os/desktop` faça
 * typecheck/lint mesmo sem `electron` instalado (fase atual do
 * scaffolding). O runtime real é acoplado via `import()` dinâmico
 * resolvido em runtime pelo Electron.
 */

export interface ElectronEvent {
  preventDefault(): void;
}

export interface ElectronApp {
  whenReady(): Promise<void>;
  quit(): void;
  exit(code: number): void;
  on(event: 'window-all-closed', listener: () => void): void;
  on(event: 'before-quit', listener: (event: ElectronEvent) => void): void;
  on(event: 'open-url', listener: (event: ElectronEvent, url: string) => void): void;
}

export interface BrowserWindowWebPreferences {
  readonly contextIsolation?: boolean;
  readonly nodeIntegration?: boolean;
  readonly sandbox?: boolean;
  readonly preload?: string;
}

export interface BrowserWindowOptions {
  readonly width?: number;
  readonly height?: number;
  readonly webPreferences?: BrowserWindowWebPreferences;
}

export interface BrowserWindowInstance {
  loadURL(url: string): Promise<void>;
  close(): void;
  readonly webContents: { readonly id: number };
  isDestroyed(): boolean;
}

export interface NodeReadable {
  on(event: 'data', handler: (chunk: unknown) => void): void;
}

export interface UtilityProcessForkOptions {
  readonly env?: Record<string, string>;
  readonly stdio?: 'pipe' | 'inherit' | 'ignore';
  readonly serviceName?: string;
}

export interface UtilityProcessInstance {
  readonly pid: number | undefined;
  readonly stdout: NodeReadable | null;
  readonly stderr: NodeReadable | null;
  on(event: 'message', handler: (msg: unknown) => void): void;
  on(event: 'exit', handler: (code: number | null) => void): void;
  once(event: 'exit', handler: (code: number | null) => void): void;
  postMessage(message: unknown): void;
  kill(): boolean;
}

export interface UtilityProcessFactory {
  fork(
    modulePath: string,
    args?: readonly string[],
    options?: UtilityProcessForkOptions,
  ): UtilityProcessInstance;
}

export interface ElectronRuntime {
  readonly app: ElectronApp;
  readonly BrowserWindow: new (options: BrowserWindowOptions) => BrowserWindowInstance;
  readonly utilityProcess: UtilityProcessFactory;
}

export async function loadElectron(): Promise<ElectronRuntime | null> {
  try {
    const specifier = 'electron';
    const mod = (await import(/* @vite-ignore */ specifier)) as unknown;
    return mod as ElectronRuntime;
  } catch {
    return null;
  }
}
