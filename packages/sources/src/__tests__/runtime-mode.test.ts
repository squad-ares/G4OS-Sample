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

  it('downgrades container to compat on Windows with warn (CR7-48)', () => {
    // CR7-48: Windows não suporta protected runtime; mesmo com container
    // explícito, downgrade para compat com log warn é o comportamento
    // intencional. Antes este teste esperava 'protected', mas a impl
    // (e o ADR-0081 / CLAUDE.md) confirma que Windows é compat-only.
    expect(resolveRuntimeMode({ platform: 'win32', executionMode: 'container' })).toBe('compat');
  });

  it('respects explicit container (protected) on non-Windows', () => {
    expect(resolveRuntimeMode({ platform: 'darwin', executionMode: 'container' })).toBe(
      'protected',
    );
    expect(resolveRuntimeMode({ platform: 'linux', executionMode: 'container' })).toBe('protected');
  });
});
