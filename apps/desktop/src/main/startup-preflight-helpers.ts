import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { IntegrityFailure } from '@g4os/platform';
import { getAppPaths } from '@g4os/platform';
import type { StartupPreflightIssue, StartupPreflightOptions } from './startup-preflight-types.ts';

export async function ensureAppDirectories(createdDirectories: string[]): Promise<void> {
  const appPaths = getAppPaths();
  const requiredDirectories = [
    appPaths.config,
    appPaths.data,
    appPaths.cache,
    appPaths.state,
    appPaths.logs,
  ];

  for (const directory of requiredDirectories) {
    const existed = existsSync(directory);
    await mkdir(directory, { recursive: true });
    if (!existed) {
      createdDirectories.push(directory);
    }
  }
}

export async function inspectJsonFile(
  path: string,
): Promise<{ readonly exists: boolean; readonly valid: boolean }> {
  if (!existsSync(path)) {
    return { exists: false, valid: false };
  }

  try {
    JSON.parse(await readFile(path, 'utf-8'));
    return { exists: true, valid: true };
  } catch {
    return { exists: true, valid: false };
  }
}

export function resolveRuntimeLocation(options: StartupPreflightOptions): {
  readonly runtimeDir: string;
  readonly vendorDir: string;
} {
  if (options.isPackaged) {
    return {
      runtimeDir: join(process.resourcesPath, 'runtime'),
      vendorDir: join(process.resourcesPath, 'vendor'),
    };
  }

  return {
    runtimeDir: resolve(options.rootDir, 'apps/desktop/dist/runtime'),
    vendorDir: resolve(options.rootDir, 'apps/desktop/dist/vendor'),
  };
}

/**
 * Mapeia `IntegrityFailure` para um issue do preflight com
 * severidade contextual.
 */
export function installMetaIssue(
  isPackaged: boolean,
  failure: IntegrityFailure,
): StartupPreflightIssue {
  if (failure.code === 'meta_missing') {
    return {
      code: 'install-meta.missing',
      severity: isPackaged ? 'fatal' : 'informational',
      message: isPackaged
        ? 'install-meta.json ausente. Build incompleta ou instalação corrompida — reinstale o aplicativo.'
        : 'install-meta.json ausente em dev. Rodar `pnpm prebundle` antes de empacotar.',
      context: { path: failure.path },
    };
  }
  if (failure.code === 'meta_corrupt') {
    return {
      code: 'install-meta.corrupt',
      severity: 'fatal',
      message:
        'install-meta.json corrompido ou inválido. Build comprometida — reinstale o aplicativo.',
      context: { path: failure.path, cause: failure.cause },
    };
  }
  if (failure.code === 'app_version_mismatch') {
    return {
      code: 'install-meta.version-mismatch',
      severity: 'fatal',
      message: `Versão do app (${failure.actual}) não bate com a do install-meta (${failure.expected}). Instalação misturada — reinstale o aplicativo limpo.`,
      context: { expected: failure.expected, actual: failure.actual },
    };
  }
  return {
    code: 'install-meta.runtime-issue',
    severity: 'recoverable',
    message: 'Problema com runtime bundled detectado.',
    context: { failure },
  };
}
