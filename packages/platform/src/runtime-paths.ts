import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { getPlatformInfo } from './platform-info.ts';

/**
 * CR-43 F-CR43-8: `executableSuffix` movido de `PlatformInfo` (campo público)
 * para função privada deste módulo. Único consumer real era `runtime-paths.ts`
 * — não há motivo para expor no contrato público de platform.
 */
function executableSuffix(): '' | '.exe' {
  return getPlatformInfo().family === 'windows' ? '.exe' : '';
}

interface RuntimeLocation {
  /** Runtime directory base (ex: resourcesPath/runtime em packaged, dist/runtime em dev) */
  readonly runtimeDir: string;
  /** Vendor directory (bundled binaries como node, git, uv) */
  readonly vendorDir: string;
}

let _location: RuntimeLocation | null = null;

export function initRuntimePaths(location: RuntimeLocation): void {
  if (_location !== null) {
    throw new Error('Runtime paths already initialized');
  }
  _location = location;
}

function requireLocation(): RuntimeLocation {
  if (_location === null) {
    throw new AppError({
      code: ErrorCode.UNKNOWN_ERROR,
      message: 'Runtime paths not initialized. Call initRuntimePaths() on app start.',
    });
  }
  return _location;
}

export const runtime = {
  /** Claude Agent SDK CLI */
  claudeSdkCli(): string {
    const loc = requireLocation();
    return join(loc.runtimeDir, 'claude-agent-sdk', 'cli.js');
  },

  /** Network interceptor */
  interceptor(): string {
    const loc = requireLocation();
    return join(loc.runtimeDir, 'interceptor', 'network-interceptor.cjs');
  },

  /** MCP servers bundled */
  sessionMcpServer(): string {
    const loc = requireLocation();
    return join(loc.runtimeDir, 'session-mcp-server', 'index.js');
  },

  bridgeMcpServer(): string {
    const loc = requireLocation();
    return join(loc.runtimeDir, 'bridge-mcp-server', 'index.js');
  },

  /** Vendored binaries */
  git(): string {
    const { family } = getPlatformInfo();
    const loc = requireLocation();
    if (family === 'windows') {
      return join(loc.vendorDir, 'git', 'cmd', `git${executableSuffix()}`);
    }
    return join(loc.vendorDir, 'git', 'bin', 'git');
  },

  node(): string {
    const loc = requireLocation();
    return join(loc.vendorDir, 'node', `node${executableSuffix()}`);
  },

  uv(): string {
    const loc = requireLocation();
    return join(loc.vendorDir, 'uv', `uv${executableSuffix()}`);
  },
} as const;

/**
 * CR-18 F-P3: helper test-only para resetar o singleton entre testes.
 * Sem isso, suítes que querem reinicializar via `initRuntimePaths` (ex.:
 * `__tests__/platform.test.ts`) ficavam com estado do teste anterior e
 * só validavam o try/catch do "already initialized". NÃO usar em código
 * de aplicação — singleton-by-design para o runtime do produto.
 */
export function _resetForTestingInternal(): void {
  _location = null;
}

/** Valida que todos os runtime paths críticos existem. Chamar em startup. */
export function validateRuntimeIntegrity(): { ok: boolean; missing: string[] } {
  // bridge-mcp-server e session-mcp-server são skeletons pendentes (TASK-18-01/02).
  // Enquanto não promovidos, nunca existem em dev/prod — incluí-los geraria
  // `runtime.missing` em todo boot, tornando o sinal ruído permanente.
  // Readicionar ao array quando o pacote for promovido para implementação real.
  const checks: Array<[string, string]> = [
    ['claude-sdk-cli', runtime.claudeSdkCli()],
    ['interceptor', runtime.interceptor()],
  ];
  const missing: string[] = [];
  for (const [name, path] of checks) {
    if (!existsSync(path)) {
      missing.push(`${name}: ${path}`);
    }
  }
  return { ok: missing.length === 0, missing };
}
