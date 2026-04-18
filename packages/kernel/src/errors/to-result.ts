import { ResultAsync } from 'neverthrow';
import { AppError } from './app-error.ts';
import { ErrorCode } from './error-codes.ts';

/**
 * Converte uma Promise em ResultAsync. Erros nao-AppError sao encapsulados
 * como UNKNOWN_ERROR com o original como cause.
 */

export function toResult<T>(
  promise: Promise<T>,
  fallbackCode: ErrorCode = ErrorCode.UNKNOWN_ERROR,
): ResultAsync<T, AppError> {
  return ResultAsync.fromPromise(promise, (err) => {
    if (err instanceof AppError) return err;
    return new AppError({
      code: fallbackCode,
      message: err instanceof Error ? err.message : String(err),
      cause: err,
    });
  });
}
