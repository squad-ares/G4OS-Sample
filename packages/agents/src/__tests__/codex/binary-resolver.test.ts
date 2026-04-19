import { AgentError } from '@g4os/kernel/errors';
import { describe, expect, it } from 'vitest';
import { resolveCodexBinary } from '../../codex/binary-resolver.ts';

describe('resolveCodexBinary', () => {
  it('prefers CODEX_DEV_PATH when it exists', () => {
    const result = resolveCodexBinary({
      env: (name) =>
        name === 'CODEX_DEV_PATH'
          ? '/dev/bin/codex'
          : name === 'CODEX_PATH'
            ? '/prod/bin/codex'
            : undefined,
      fileExists: () => true,
    });
    expect(result).toBe('/dev/bin/codex');
  });

  it('falls back to CODEX_PATH when dev path is unset', () => {
    const result = resolveCodexBinary({
      env: (name) => (name === 'CODEX_PATH' ? '/prod/bin/codex' : undefined),
      fileExists: () => true,
    });
    expect(result).toBe('/prod/bin/codex');
  });

  it('falls back to bundled binary when envs are unset', () => {
    const result = resolveCodexBinary({
      env: () => undefined,
      bundledBinary: () => '/runtime/codex/bin/codex',
      fileExists: (path) => path === '/runtime/codex/bin/codex',
    });
    expect(result).toBe('/runtime/codex/bin/codex');
  });

  it('skips env path when file does not exist and tries bundled', () => {
    const result = resolveCodexBinary({
      env: (name) => (name === 'CODEX_PATH' ? '/stale/bin/codex' : undefined),
      bundledBinary: () => '/runtime/codex/bin/codex',
      fileExists: (path) => path === '/runtime/codex/bin/codex',
    });
    expect(result).toBe('/runtime/codex/bin/codex');
  });

  it('throws AgentError.unavailable when nothing resolves', () => {
    expect(() =>
      resolveCodexBinary({
        env: () => undefined,
        fileExists: () => false,
      }),
    ).toThrow(AgentError);
  });
});
