import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { execa } from 'execa';
import type { DownloadResult } from './download.ts';
import type { Runtime } from './types.ts';

export interface VerifyResult {
  runtime: Runtime;
  binaryPath: string;
  version: string;
  /**
   * SHA-256 do binário extraído (não do archive). Usado pelo
   * `generate-install-meta` para popular `install-meta.json`. TASK-12-07.
   */
  binarySha256: string;
  ok: boolean;
  reason?: string;
}

/**
 * Post-extract smoke test: `<binary> --version` precisa retornar algo.
 * Captura stderr+stdout e normaliza. Também computa SHA-256 do binário
 * para alimentar o manifest de install identity.
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
      binarySha256: '',
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
        binarySha256: '',
        ok: false,
        reason: `exit ${result.exitCode}: ${output.slice(0, 200)}`,
      };
    }
    const binarySha256 = await computeFileSha256(binary);
    return {
      runtime,
      binaryPath: binary,
      version: normalizeVersion(output),
      binarySha256,
      ok: true,
    };
  } catch (err) {
    return {
      runtime,
      binaryPath: binary,
      version: '',
      binarySha256: '',
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

async function computeFileSha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolveStream, rejectStream) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolveStream());
    stream.on('error', (err) => rejectStream(err));
  });
  return hash.digest('hex');
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
