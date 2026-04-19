import { existsSync } from 'node:fs';
import { AgentError } from '@g4os/kernel/errors';

export type EnvLookup = (name: string) => string | undefined;

export interface BinaryResolverOptions {
  readonly env?: EnvLookup;
  readonly bundledBinary?: () => string;
  readonly fileExists?: (path: string) => boolean;
}

const DEV_ENV = 'CODEX_DEV_PATH';
const PROD_ENV = 'CODEX_PATH';

export function resolveCodexBinary(options: BinaryResolverOptions = {}): string {
  const env = options.env ?? defaultEnv;
  const fileExists = options.fileExists ?? existsSync;

  const devPath = env(DEV_ENV);
  if (devPath && fileExists(devPath)) return devPath;

  const prodPath = env(PROD_ENV);
  if (prodPath && fileExists(prodPath)) return prodPath;

  if (options.bundledBinary) {
    const bundled = options.bundledBinary();
    if (fileExists(bundled)) return bundled;
  }

  throw AgentError.unavailable('codex', {
    reason: 'Codex binary not found; set CODEX_PATH or install the bundled runtime',
  });
}

function defaultEnv(name: string): string | undefined {
  // Env reads are funnelled through this helper so the `noProcessEnv` override
  // at biome.json covers binary-resolver.ts explicitly.
  return process.env[name];
}
