import { homedir, tmpdir } from 'node:os';

/**
 * PLATFORM INFO — single source of truth.
 * NENHUM OUTRO ARQUIVO no monorepo pode usar process.platform diretamente.
 * Lint rule enforcement em .dependency-cruiser.cjs + biome custom.
 */

export type OsFamily = 'macos' | 'windows' | 'linux';
export type Architecture = 'x64' | 'arm64';

/**
 * CR-43 F-CR43-8: PlatformInfo contem apenas informação de SO — não de
 * runtime context (Electron vs Node). Campos removidos:
 *   - `isPackaged`: usar `electron.app.isPackaged` (oracle autoritativo);
 *     `getPlatformInfo().isPackaged` derivava de heurística `defaultApp`
 *     que divergia em utility-process e contextos não-Electron.
 *   - `isDev`: kernel/logger já lê `NODE_ENV` direto via `readProcessEnv`.
 *   - `isWsl`: zero consumers — reintroduzir com consumer real quando necessário.
 *   - `pathSeparator`: zero consumers externos — quem precisar usa
 *     `family === 'windows' ? ';' : ':'` inline ou `node:path.delimiter`.
 *   - `executableSuffix`: movido para função privada em `runtime-paths.ts`.
 */
export interface PlatformInfo {
  readonly family: OsFamily;
  readonly arch: Architecture;
  readonly version: string;
  readonly homeDir: string;
  readonly tempDir: string;
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

  _platformInfo = Object.freeze<PlatformInfo>({
    family,
    arch,
    version: process.version,
    homeDir,
    tempDir: tmpdir(),
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

/**
 * Distribution flavor — derivado de `G4OS_DISTRIBUTION_FLAVOR`.
 *
 * Valida com regex `/^[a-z0-9-]+$/` para evitar path traversal via env
 * (`'../../../etc'` propagaria para `envPaths()` em `paths.ts`); em caso de
 * input inválido retorna `'public'` (fallback seguro).
 *
 * CR-23 F-CR23-3: extraído pra ser fonte única consumida por `paths.ts`
 * (APP_NAME) e `single-instance-bootstrap` (PROTOCOL). Antes cada caller
 * re-derivava inline com regex próprio (e às vezes sem regex), abrindo
 * janela pra drift entre APP_NAME e PROTOCOL.
 */
const FLAVOR_PATTERN = /^[a-z0-9-]+$/;

export function getDistributionFlavor(): string {
  const raw = process.env['G4OS_DISTRIBUTION_FLAVOR'] ?? 'public';
  return FLAVOR_PATTERN.test(raw) ? raw : 'public';
}

/**
 * Nome canônico do app (binário, paths, deep-link protocol). Mantém
 * a regra v2: `flavor === 'g4'` → `g4os-internal`; qualquer outro → `g4os`.
 *
 * Único método autorizado para resolver o nome do app — qualquer consumer
 * que precise de PROTOCOL (`g4os://`) ou APP_NAME (envPaths) deve passar
 * por aqui em vez de re-derivar inline.
 */
export function getAppName(): string {
  return getDistributionFlavor() === 'g4' ? 'g4os-internal' : 'g4os';
}

/**
 * Scheme do deep-link protocol (sem `:` final). Idêntico a `getAppName()`
 * por design — quando o protocol diverge do app name (raro, ex.: backwards
 * compat), atualizar aqui em vez de espalhar.
 */
export function getProtocolName(): string {
  return getAppName();
}
