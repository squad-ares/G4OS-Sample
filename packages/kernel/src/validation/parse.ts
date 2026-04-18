import { err, ok, type Result } from 'neverthrow';
import type { ZodType } from 'zod';
import { AppError, ErrorCode } from '../errors/index.ts';

export function parseSchema<T>(
  schema: ZodType<T>,
  input: unknown,
  context?: string,
): Result<T, AppError> {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return ok(parsed.data);
  }

  const ctxValue = context ? ` (${context})` : '';

  return err(
    new AppError({
      code: ErrorCode.VALIDATION_ERROR,
      message: `Validation failed${ctxValue}: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
      context: {
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
          code: i.code,
        })),
      },
    }),
  );
}
