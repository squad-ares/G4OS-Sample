import type { Result } from 'neverthrow';
import type { ZodType } from 'zod';
import type { AppError } from '../errors/app-error.ts';
import { parseSchema } from '../validation/parse.ts';

export function serializeJson<T>(value: T): string {
  return JSON.stringify(value);
}

export function deserializeJson<T>(
  schema: ZodType<T>,
  raw: string,
  context?: string,
): Result<T, AppError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return parseSchema(schema, undefined, context ?? 'JSON.parse');
  }
  return parseSchema(schema, parsed, context);
}

export function serializeJsonl<T>(items: T[]): string {
  return items.map((item) => JSON.stringify(item)).join('\n');
}

export function deserializeJsonl<T>(schema: ZodType<T>, raw: string): Array<Result<T, AppError>> {
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => deserializeJson(schema, line, 'JSONL line'));
}
