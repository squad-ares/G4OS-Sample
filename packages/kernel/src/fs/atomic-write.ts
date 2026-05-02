import { randomBytes } from 'node:crypto';
import { copyFile, open, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

import { err, ok, type Result } from 'neverthrow';
import { FsError } from '../errors/fs-error.ts';
import { createLogger } from '../logger/index.ts';

const log = createLogger('fs:atomic-write');

/**
 * Escrita atômica de arquivo via `tmp → fsync(file) → rename → fsync(dir)`.
 *
 * Garantias:
 *   1. Ou o arquivo permanece com o conteúdo antigo, ou recebe o novo
 *      conteúdo completo. Crash mid-write não deixa arquivo truncado.
 *   2. `fsync` no fd força flush dos blocos para disco antes do rename.
 *   3. `rename` é atômico no nível do filesystem em POSIX (POSIX.1-2017,
 *      §rename(2)) e quase-atômico em NTFS (em Windows o `MoveFileEx`
 *      via Node faz replace-with-rename).
 *   4. `fsync(dirfd)` em Linux/macOS garante que a entrada de diretório
 *      do rename também esteja durável (dir entry pode ficar em cache de
 *      buffer do filesystem mesmo após o rename retornar).
 *
 * Trade-offs:
 *   - Dois fsyncs (file + dir) custam I/O. Para escritas frequentes (>10/s)
 *     considerar batching no caller.
 *   - Em Windows, `fsync` no diretório não é suportado — silenciosamente
 *     ignoramos `ENOTDIR`/`EPERM`/`EISDIR` no path do diretório.
 *
 * Uso:
 *   ```ts
 *   await writeAtomic('/path/to/file.json', JSON.stringify(data));
 *   ```
 *
 * Substitui o padrão inseguro `fs.writeFile(path, data)` que sobrescreve
 * in-place sem tmp+fsync — fonte da Dor #3 V1 (corrupção de
 * credentials.enc após crash mid-write) que motivou ADR-0050.
 */
export async function writeAtomic(
  path: string,
  data: string | Uint8Array,
  options?: { readonly mode?: number },
): Promise<void> {
  // Sufixo aleatório (8 bytes hex) defende contra colisão teórica entre dois
  // callers no mesmo PID + mesmo Date.now() (resolução ms). PID sozinho não
  // basta — chamadas in-process concorrentes ao mesmo target compartilham
  // process.pid; Date.now() pode colidir em ms quando event loop dispara
  // múltiplos awaits no mesmo tick. UUID-equivalente em entropia.
  const tmpPath = `${path}.${process.pid}.${Date.now()}.${randomBytes(8).toString('hex')}.tmp`;
  const mode = options?.mode ?? 0o600;

  let fileHandle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    fileHandle = await open(tmpPath, 'w', mode);
    await fileHandle.writeFile(data);
    await fileHandle.sync();
    await fileHandle.close();
    fileHandle = null;

    // rename() lança EXDEV quando tmp e target estão em filesystems diferentes
    // (Docker volume mount, /tmp em tmpfs, OneDrive sync no Windows).
    // Fallback: copy + unlink (não-atômico mas funcional).
    try {
      await rename(tmpPath, path);
    } catch (renameErr) {
      const code = (renameErr as { code?: string } | null)?.code;
      if (code !== 'EXDEV') throw renameErr;
      log.warn(
        { path, code },
        'rename failed with EXDEV (cross-device); falling back to copy+unlink',
      );
      await copyFile(tmpPath, path);
      // copyFile não preserva mode do source — reaplica `mode` (default 0o600)
      // para que credenciais escritas via fallback não fiquem 0o644 (legíveis).
      try {
        const { chmod } = await import('node:fs/promises');
        await chmod(path, mode);
      } catch (chmodErr) {
        log.warn(
          { path, err: String(chmodErr) },
          'chmod after EXDEV copy failed (may be FAT/NTFS without POSIX modes)',
        );
      }
      await unlink(tmpPath);
    }

    await fsyncDir(dirname(path));
  } catch (error) {
    if (fileHandle !== null) {
      try {
        await fileHandle.close();
      } catch {
        // best-effort cleanup
      }
    }
    try {
      await unlink(tmpPath);
    } catch {
      // tmp may not exist if open() itself failed
    }
    throw error;
  }
}

/**
 * fsync em descritor de diretório. Em Windows não é suportado (retorna
 * EPERM/ENOTDIR/EISDIR ou similar) — tratamos como no-op.
 */
async function fsyncDir(dir: string): Promise<void> {
  let dirHandle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    dirHandle = await open(dir, 'r');
    await dirHandle.sync();
  } catch (error) {
    if (!isUnsupportedDirSyncError(error)) {
      throw error;
    }
    // Windows: dir fsync não suportado, ignora silenciosamente
  } finally {
    if (dirHandle !== null) {
      try {
        await dirHandle.close();
      } catch {
        // best-effort
      }
    }
  }
}

function isUnsupportedDirSyncError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return (
    code === 'EPERM' ||
    code === 'EISDIR' ||
    code === 'ENOTDIR' ||
    code === 'EACCES' ||
    code === 'EINVAL'
  );
}

/**
 * Variante Result do `writeAtomic`. CR-18 F-K2: callers eram forçados a
 * `try/catch` genérico, perdendo o tipo do erro. As factories
 * `FsError.diskFull/accessDenied/notFound` já existiam mas não eram usadas
 * por escrita atômica — agora errno do node é mapeado para `FsError.*`
 * tipado, propagado via `Result`.
 *
 * Erros conhecidos:
 *   - `ENOSPC` → `FsError.diskFull`
 *   - `EACCES` / `EPERM` → `FsError.accessDenied`
 *   - `ENOENT` → `FsError.notFound` (raro — caso target dir não exista)
 *   - outros (EBUSY, EROFS, ENAMETOOLONG, EISDIR, ENOTDIR, ...) →
 *     `FsError` com `FS_IO_ERROR`. CR-27 F-CR27-4: antes o fallback usava
 *     `FS_ACCESS_DENIED`, levando UI/Repair a sugerir "verifique permissões"
 *     mesmo quando a causa raiz era read-only filesystem ou file lock.
 */
export async function writeAtomicResult(
  path: string,
  data: string | Uint8Array,
  options?: { readonly mode?: number },
): Promise<Result<void, FsError>> {
  try {
    await writeAtomic(path, data, options);
    return ok(undefined);
  } catch (cause) {
    return err(mapErrnoToFsError(path, cause));
  }
}

function mapErrnoToFsError(path: string, cause: unknown): FsError {
  if (typeof cause !== 'object' || cause === null) {
    return new FsError({
      code: 'fs.io_error',
      message: `writeAtomic failed: ${String(cause)}`,
      context: { path },
      cause,
    });
  }
  const code = (cause as { code?: unknown }).code;
  switch (code) {
    case 'ENOSPC':
      return FsError.diskFull(path);
    case 'EACCES':
    case 'EPERM':
      return FsError.accessDenied(path);
    case 'ENOENT':
      return FsError.notFound(path);
    default:
      // CR-27 F-CR27-4: errno genérico (EBUSY, EROFS, ENAMETOOLONG, EISDIR,
      // ENOTDIR, ...). `FS_IO_ERROR` discrimina IO failure de access denied;
      // errno original preservado em `context.errno` pra diagnóstico.
      return new FsError({
        code: 'fs.io_error',
        message: `writeAtomic failed (${typeof code === 'string' ? code : 'unknown'}): ${path}`,
        context: { path, errno: typeof code === 'string' ? code : undefined },
        cause,
      });
  }
}
