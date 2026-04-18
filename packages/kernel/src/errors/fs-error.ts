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
}
