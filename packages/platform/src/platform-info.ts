import { readFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';

/**
 * PLATFORM INFO — single source of truth.
 * NENHUM OUTRO ARQUIVO no monorepo pode usar process.platform diretamente.
 * Lint rule enforcement em .dependency-cruiser.cjs + biome custom.
 */

export type OsFamily = 'macos' | 'windows' | 'linux';
export type Architecture = 'x64' | 'arm64';

export interface PlatformInfo {
  readonly family: OsFamily;
  readonly arch: Architecture;
  readonly version: string;
  readonly isDev: boolean;
  readonly isPackaged: boolean;
  readonly isWsl: boolean;
  readonly homeDir: string;
  readonly tempDir: string;
  readonly pathSeparator: string;
  readonly executableSuffix: '' | '.exe';
}

function detectOsFamily(): OsFamily {
  switch (process.platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    case 'linux':
      return 'linux';
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

function detectArch(): Architecture {
  if (process.arch === 'arm64') return 'arm64';
  if (process.arch === 'x64') return 'x64';
  throw new Error(`Unsupported arch: ${process.arch}`);
}

function detectWsl(): boolean {
  if (detectOsFamily() !== 'linux') return false;
  try {
    return /microsoft/i.test(readFileSync('/proc/version', 'utf-8'));
  } catch {
    return false;
  }
}

let _platformInfo: PlatformInfo | null = null;

export function getPlatformInfo(): PlatformInfo {
  if (_platformInfo !== null) return _platformInfo;

  const family = detectOsFamily();
  const arch = detectArch();

  // Fallback para `os.homedir()` se env não setou — em ambientes minimal
  // (Docker stripped, systemd service) homeDir vinha empty string. Se todos
  // os fallbacks vazios, throw em boot para evitar paths relativos ao cwd.
  const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? homedir() ?? '';
  if (!homeDir) {
    throw new Error(
      'Home directory not available. Set HOME or USERPROFILE env var, or ensure os.homedir() works.',
    );
  }
  // Electron sets process.defaultApp; check via runtime cast (electron types
  // não fazem parte do platform package).
  const isPackaged =
    typeof process.versions['electron'] === 'string' &&
    !(process as unknown as Record<string, unknown>)['defaultApp'];

  _platformInfo = Object.freeze<PlatformInfo>({
    family,
    arch,
    version: process.version,
    isDev: process.env['NODE_ENV'] !== 'production',
    isPackaged,
    isWsl: detectWsl(),
    homeDir,
    tempDir: tmpdir(),
    pathSeparator: family === 'windows' ? ';' : ':',
    executableSuffix: family === 'windows' ? '.exe' : '',
  });

  return _platformInfo;
}

export const isMacOS = (): boolean => getPlatformInfo().family === 'macos';
export const isWindows = (): boolean => getPlatformInfo().family === 'windows';
export const isLinux = (): boolean => getPlatformInfo().family === 'linux';

/**
 * Atalho idiomático para `getPlatformInfo().homeDir`. Prefira esse helper
 * em vez de `import { homedir } from 'node:os'` — o gate `check:platform-leaks`
 * rejeita named imports diretos de `node:os` fora deste pacote (ADR-0013).
 */
export const getHomeDir = (): string => getPlatformInfo().homeDir;

/**
 * Atalho idiomático para `getPlatformInfo().tempDir`. Mesma regra de
 * `getHomeDir`: nunca importe `tmpdir` direto fora deste pacote.
 */
export const getTempDir = (): string => getPlatformInfo().tempDir;
