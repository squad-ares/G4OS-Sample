import { type ZodType, z } from 'zod';
import { createLogger } from '../logger/index.ts';

const log = createLogger('env');

export function getEnv<T>(name: string, schema: ZodType<T>): T {
  const raw = process.env[name];
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    log.fatal(
      {
        envVar: name,
        issues: parsed.error.issues,
      },
      `Invalid environment variable: ${name}`,
    );
    throw new Error(`Invalid env var: ${name}`);
  }
  return parsed.data;
}

export function getEnvOptional<T>(name: string, schema: ZodType<T | undefined>): T | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;
  return getEnv(name, schema as ZodType<T>);
}

export const EnvSchemas = {
  url: z.url(),
  port: z.coerce.number().int().min(1).max(65535),
  bool: z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1'),
  apiKey: z.string().min(8),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
};
