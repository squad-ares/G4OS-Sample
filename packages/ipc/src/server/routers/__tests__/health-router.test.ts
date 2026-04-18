import { describe, expect, it } from 'vitest';
import { createTestCaller } from '../../__tests__/helpers/create-test-caller.ts';

describe('health router', () => {
  it('ping returns "ok"', async () => {
    const caller = createTestCaller();
    const result = await caller.health.ping();
    expect(result).toBe('ok');
  });

  it('version returns shape with string version and numeric startedAt', async () => {
    const caller = createTestCaller();
    const result = await caller.health.version();
    expect(typeof result.version).toBe('string');
    expect(typeof result.startedAt).toBe('number');
    expect(result.startedAt).toBeGreaterThan(0);
  });
});
