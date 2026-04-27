import { AppError, type AppErrorOptions } from './app-error.ts';
import { ErrorCode } from './error-codes.ts';

export class FsError extends AppError {
  constructor(
    options: Omit<AppErrorOptions, 'code'> & { code: Extract<ErrorCode, `fs.${string}`> },
  ) {
    super(options);
    this.name = 'FsError';
  }

  static accessDenied(path: string): FsError {
    return new FsError({
      code: ErrorCode.FS_ACCESS_DENIED,
      message: `Access denied: ${path}`,
      context: { path },
    });
  }

  static notFound(path: string): FsError {
    return new FsError({
      code: ErrorCode.FS_NOT_FOUND,
      message: `File not found: ${path}`,
      context: { path },
    });
  }

  static diskFull(path: string): FsError {
    return new FsError({
      code: ErrorCode.FS_DISK_FULL,
      message: `Disk full when writing: ${path}`,
      context: { path },
    });
  }

  static pathTraversal(relativePath: string): FsError {
    return new FsError({
      code: ErrorCode.FS_PATH_TRAVERSAL,
      message: `Path traversal blocked: ${relativePath}`,
      context: { relativePath },
    });
  }

  static fileTooLarge(relativePath: string, sizeBytes: number, maxBytes: number): FsError {
    return new FsError({
      code: ErrorCode.FS_FILE_TOO_LARGE,
      message: `File "${relativePath}" exceeds max size (${sizeBytes} > ${maxBytes} bytes)`,
      context: { relativePath, sizeBytes, maxBytes },
    });
  }
}
