import { existsSync } from 'node:fs';
import { execa } from 'execa';
import type { DownloadResult } from './download.ts';
import type { Runtime } from './types.ts';

export interface VerifyResult {
  runtime: Runtime;
  binaryPath: string;
  version: string;
  ok: boolean;
  reason?: string;
}

/**
 * Post-extract smoke test: `<binary> --version` precisa retornar algo.
 * Captura stderr+stdout e normaliza.
 */
export async function verifyBinary(
  runtime: Runtime,
  download: DownloadResult,
): Promise<VerifyResult> {
  const binary = download.binaryPath;

  if (!existsSync(binary)) {
    return {
      runtime,
      binaryPath: binary,
      version: '',
      ok: false,
      reason: `binary missing at ${binary}`,
    };
  }

  const versionArg = resolveVersionArg(runtime);

  try {
    const result = await execa(binary, [versionArg], {
      timeout: 10_000,
      reject: false,
    });
    const output = `${result.stdout}\n${result.stderr}`.trim();
    if (result.exitCode !== 0) {
      return {
        runtime,
        binaryPath: binary,
        version: '',
        ok: false,
        reason: `exit ${result.exitCode}: ${output.slice(0, 200)}`,
      };
    }
    return {
      runtime,
      binaryPath: binary,
      version: normalizeVersion(output),
      ok: true,
    };
  } catch (err) {
    return {
      runtime,
      binaryPath: binary,
      version: '',
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

function resolveVersionArg(runtime: Runtime): string {
  switch (runtime) {
    case 'node':
      return '--version';
    case 'pnpm':
      return '--version';
    case 'uv':
      return '--version';
    case 'python':
      return '--version';
    case 'git':
      return '--version';
  }
}

function normalizeVersion(output: string): string {
  // Pegar primeira linha não-vazia, que geralmente é a versão
  const line = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)[0];
  return line ?? '';
}
