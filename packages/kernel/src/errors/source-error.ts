import { AppError, type AppErrorOptions } from './app-error.ts';
import { ErrorCode } from './error-codes.ts';

export class SourceError extends AppError {
  constructor(
    options: Omit<AppErrorOptions, 'code'> & { code: Extract<ErrorCode, `source.${string}`> },
  ) {
    super(options);
    this.name = 'SourceError';
  }

  static notFound(slug: string): SourceError {
    return new SourceError({
      code: ErrorCode.SOURCE_NOT_FOUND,
      message: `Source not found: ${slug}`,
      context: { slug },
    });
  }

  static authRequired(slug: string): SourceError {
    return new SourceError({
      code: ErrorCode.SOURCE_AUTH_REQUIRED,
      message: `Authentication required for source: ${slug}`,
      context: { slug },
    });
  }

  static incompatible(slug: string, reason: string): SourceError {
    return new SourceError({
      code: ErrorCode.SOURCE_INCOMPATIBLE,
      message: `Source incompatible: ${slug} — ${reason}`,
      context: { slug, reason },
    });
  }
}
