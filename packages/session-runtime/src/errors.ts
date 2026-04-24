import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { err, type Result } from 'neverthrow';

const log = createLogger('sessions-service:errors');

export function notFoundError(id: string): AppError {
  return new AppError({
    code: ErrorCode.SESSION_NOT_FOUND,
    message: `session ${id} not found`,
    context: { id },
  });
}

export function failure<T>(
  scope: string,
  error: unknown,
  context: Record<string, unknown>,
): Result<T, AppError> {
  log.error({ err: error, ...context }, `${scope} failed`);
  return err(
    new AppError({
      code: ErrorCode.UNKNOWN_ERROR,
      message: `${scope} failed`,
      context,
      cause: error,
    }),
  );
}
