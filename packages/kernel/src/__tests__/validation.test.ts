import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ErrorCode } from '../errors/error-codes.ts';
import { PaginationSchema, SlugSchema, UuidSchema } from '../validation/builders.ts';
import { EnvSchemas, getEnv, getEnvOptional } from '../validation/env.ts';
import { parseSchema } from '../validation/parse.ts';

describe('parseSchema', () => {
  it('returns ok for valid input', () => {
    const result = parseSchema(z.string(), 'hello');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toBe('hello');
  });

  it('returns err with VALIDATION_ERROR for invalid input', () => {
    const result = parseSchema(z.number(), 'not-a-number', 'test context');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(result.error.message).toContain('test context');
    }
  });

  it('includes issues in error context', () => {
    const result = parseSchema(z.object({ name: z.string() }), { name: 123 });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      const issues = result.error.context.issues as Array<{ path: string }>;
      expect(issues[0]?.path).toBe('name');
    }
  });
});

describe('getEnv', () => {
  const original = { ...process.env };

  beforeEach(() => {
    Object.keys(process.env).forEach((k) => {
      if (k.startsWith('TEST_G4OS_')) delete process.env[k];
    });
  });

  afterEach(() => {
    Object.assign(process.env, original);
  });

  it('returns parsed value for valid env var', () => {
    process.env.TEST_G4OS_PORT = '8080';
    const value = getEnv('TEST_G4OS_PORT', EnvSchemas.port);
    expect(value).toBe(8080);
  });

  it('throws for invalid env var', () => {
    process.env.TEST_G4OS_PORT = 'not-a-number';
    expect(() => getEnv('TEST_G4OS_PORT', EnvSchemas.port)).toThrow();
  });
});

describe('getEnvOptional', () => {
  afterEach(() => {
    delete process.env.TEST_G4OS_OPT;
  });

  it('returns undefined when var not set', () => {
    const value = getEnvOptional('TEST_G4OS_OPT', EnvSchemas.logLevel);
    expect(value).toBeUndefined();
  });

  it('returns parsed value when var is set', () => {
    process.env.TEST_G4OS_OPT = 'debug';
    const value = getEnvOptional('TEST_G4OS_OPT', EnvSchemas.logLevel);
    expect(value).toBe('debug');
  });
});

describe('builders', () => {
  it('UuidSchema accepts valid uuid', () => {
    expect(UuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true);
  });

  it('UuidSchema rejects non-uuid', () => {
    expect(UuidSchema.safeParse('not-a-uuid').success).toBe(false);
  });

  it('SlugSchema accepts valid slug', () => {
    expect(SlugSchema.safeParse('my-workspace-v2').success).toBe(true);
  });

  it('SlugSchema rejects uppercase or spaces', () => {
    expect(SlugSchema.safeParse('My Workspace').success).toBe(false);
  });

  it('PaginationSchema applies defaults', () => {
    const result = PaginationSchema.parse({});
    expect(result.page).toBe(0);
    expect(result.pageSize).toBe(20);
  });
});
