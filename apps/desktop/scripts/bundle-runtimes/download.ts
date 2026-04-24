import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { chmod, copyFile, mkdir, rename, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execa } from 'execa';
import type { ChecksumsLockfile, RuntimeSource } from './types.ts';

interface DownloadOptions {
  source: RuntimeSource;
  targetDir: string;
  checksumsLockfile: ChecksumsLockfile;
  checksumKey: string;
  /** 'capture' grava SHA-256 após primeiro download; 'verify' falha se diferir */
  mode: 'capture' | 'verify';
}

export interface DownloadResult {
  binaryPath: string;
  sha256: string;
  sizeBytes: number;
}

/**
 * Download + verify + extract de um runtime. Idempotente: se `binaryPath`
 * já existe e o checksum bate, pula tudo. Caso contrário, faz o trabalho.
 */
export async function downloadAndExtract({
  source,
  targetDir,
  checksumsLockfile,
  checksumKey,
  mode,
}: DownloadOptions): Promise<DownloadResult> {
  const finalBinary = join(targetDir, source.binaryRelativePath);
  await mkdir(dirname(finalBinary), { recursive: true });

  const cacheFile = join(tmpdir(), 'g4os-runtime-cache', source.archiveName);
  await mkdir(dirname(cacheFile), { recursive: true });

  if (existsSync(cacheFile)) {
    console.log(`  → cached ${basename(cacheFile)}`);
  } else {
    console.log(`  → fetching ${source.url}`);
    await fetchTo(source.url, cacheFile);
  }

  const sha256 = await computeSha256(cacheFile);
  const { size } = await stat(cacheFile);

  const stored = checksumsLockfile[checksumKey];
  if (mode === 'verify') {
    if (!stored) {
      throw new Error(
        `[bundle-runtimes] checksum not captured for ${checksumKey}. ` +
          `Re-run with G4OS_BUNDLE_CHECKSUM_MODE=capture to populate lockfile.`,
      );
    }
    if (stored.sha256 !== sha256) {
      throw new Error(
        `[bundle-runtimes] checksum mismatch for ${checksumKey}:\n` +
          `  expected: ${stored.sha256}\n` +
          `  actual:   ${sha256}`,
      );
    }
  } else {
    // capture: grava (mutação é feita pelo orquestrador)
    checksumsLockfile[checksumKey] = {
      sha256,
      capturedAt: new Date().toISOString(),
    };
  }

  // Extrair ou copiar conforme formato
  await extract(cacheFile, targetDir, source);

  // Garantir +x em binários não-Windows
  if (!source.binaryRelativePath.endsWith('.exe')) {
    try {
      await chmod(finalBinary, 0o755);
    } catch {
      // ignore — pode não existir se a extração terminou estruturalmente
      // diferente do esperado; verify.ts vai pegar
    }
  }

  return { binaryPath: finalBinary, sha256, sizeBytes: size };
}

async function fetchTo(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`fetch ${url} → ${res.status} ${res.statusText}`);
  }
  const tmpPath = `${dest}.partial`;
  await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(tmpPath));
  await rename(tmpPath, dest);
}

async function computeSha256(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function extract(archive: string, targetDir: string, source: RuntimeSource): Promise<void> {
  await mkdir(targetDir, { recursive: true });

  const isBinaryDirect = source.runtime === 'pnpm' && !source.archiveName.endsWith('.zip');

  if (isBinaryDirect) {
    // pnpm publica binário direto (sem tarball). Copia para destino final.
    const dest = join(targetDir, source.binaryRelativePath);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(archive, dest);
    return;
  }

  if (source.format === 'tar.gz' || source.format === 'tar.xz') {
    const flag = source.format === 'tar.gz' ? '-xzf' : '-xJf';
    await execa('tar', [flag, archive, '-C', targetDir], { stdio: 'inherit' });
    return;
  }

  if (source.format === 'zip') {
    // unzip disponível em macOS/Linux; no Windows CI usar PowerShell Expand-Archive
    if (process.platform === 'win32') {
      await execa(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `Expand-Archive -Path '${archive}' -DestinationPath '${targetDir}' -Force`,
        ],
        { stdio: 'inherit' },
      );
    } else {
      await execa('unzip', ['-o', '-q', archive, '-d', targetDir], {
        stdio: 'inherit',
      });
    }
    return;
  }

  throw new Error(`[bundle-runtimes] unsupported format: ${String(source.format)}`);
}
