import { describe, expect, it } from 'vitest';
import { resolveRuntimeMode } from '../mcp-stdio/runtime-mode.ts';

describe('resolveRuntimeMode', () => {
  it('returns protected for auto on macOS without browser-auth', () => {
    expect(resolveRuntimeMode({ platform: 'darwin' })).toBe('protected');
  });

  it('returns compat for auto on Windows', () => {
    expect(resolveRuntimeMode({ platform: 'win32' })).toBe('compat');
  });

  it('returns compat when source needs browser auth', () => {
    expect(resolveRuntimeMode({ platform: 'darwin', needsBrowserAuth: true })).toBe('compat');
  });

  it('respects explicit host (compat)', () => {
    expect(resolveRuntimeMode({ platform: 'darwin', executionMode: 'host' })).toBe('compat');
  });

  it('respects explicit container (protected) even on Windows', () => {
    expect(resolveRuntimeMode({ platform: 'win32', executionMode: 'container' })).toBe('protected');
  });
});
