import type { SourceConfigView } from '@g4os/kernel/types';
import { describe, expect, it, vi } from 'vitest';
import { probeSource } from '../source-probe.ts';

function makeSource(
  kind: SourceConfigView['kind'],
  config: Record<string, unknown>,
  overrides: Partial<SourceConfigView> = {},
): SourceConfigView {
  return {
    id: `src-${kind}`,
    slug: kind,
    displayName: kind,
    kind,
    status: 'disconnected',
    enabled: true,
    authType: 'none',
    category: 'other',
    config,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as SourceConfigView;
}

function fakeResponse(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as unknown as Response;
}

describe('probeSource', () => {
  describe('mcp-http / api (HEAD)', () => {
    it('returns "connected" on 2xx', async () => {
      const source = makeSource('mcp-http', { url: 'https://example.com' });
      const fetchFn = vi.fn().mockResolvedValue(fakeResponse(200));
      await expect(probeSource(source, { fetch: fetchFn })).resolves.toBe('connected');
      expect(fetchFn).toHaveBeenCalledOnce();
    });

    it('returns "needs_auth" on 401/403', async () => {
      const source = makeSource('api', { url: 'https://example.com' });
      const fetchFn = vi.fn().mockResolvedValue(fakeResponse(403));
      await expect(probeSource(source, { fetch: fetchFn })).resolves.toBe('needs_auth');
    });

    it('returns "error" on 5xx', async () => {
      const source = makeSource('mcp-http', { url: 'https://example.com' });
      const fetchFn = vi.fn().mockResolvedValue(fakeResponse(503));
      await expect(probeSource(source, { fetch: fetchFn })).resolves.toBe('error');
    });

    it('returns "error" when fetch throws (network/abort)', async () => {
      const source = makeSource('mcp-http', { url: 'https://example.com' });
      const fetchFn = vi.fn().mockRejectedValue(new Error('network'));
      await expect(probeSource(source, { fetch: fetchFn })).resolves.toBe('error');
    });

    it('falls back to persisted status when url missing', async () => {
      const source = makeSource('mcp-http', {}, { status: 'needs_auth' });
      const fetchFn = vi.fn();
      await expect(probeSource(source, { fetch: fetchFn })).resolves.toBe('needs_auth');
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });

  describe('filesystem', () => {
    it('returns "connected" when access resolves', async () => {
      const source = makeSource('filesystem', { path: '/tmp/foo' });
      const fileAccess = vi.fn().mockResolvedValue(undefined);
      await expect(probeSource(source, { fileAccess })).resolves.toBe('connected');
      expect(fileAccess).toHaveBeenCalledWith('/tmp/foo');
    });

    it('returns "error" when access rejects', async () => {
      const source = makeSource('filesystem', { path: '/tmp/nope' });
      const fileAccess = vi.fn().mockRejectedValue(new Error('ENOENT'));
      await expect(probeSource(source, { fileAccess })).resolves.toBe('error');
    });

    it('returns "disconnected" when path is empty', async () => {
      const source = makeSource('filesystem', { path: '' });
      const fileAccess = vi.fn();
      await expect(probeSource(source, { fileAccess })).resolves.toBe('disconnected');
      expect(fileAccess).not.toHaveBeenCalled();
    });
  });

  describe('mcp-stdio', () => {
    it('delegates to the injected prober with command/args/env', async () => {
      const source = makeSource('mcp-stdio', {
        command: 'node',
        args: ['server.js'],
        env: { FOO: 'bar' },
      });
      const mcpStdioProbe = vi.fn().mockResolvedValue('connected' as const);
      await expect(probeSource(source, { mcpStdioProbe })).resolves.toBe('connected');
      expect(mcpStdioProbe).toHaveBeenCalledWith({
        command: 'node',
        args: ['server.js'],
        env: { FOO: 'bar' },
      });
    });

    it('returns "disconnected" when command is missing', async () => {
      const source = makeSource('mcp-stdio', { args: ['x'] });
      const mcpStdioProbe = vi.fn();
      await expect(probeSource(source, { mcpStdioProbe })).resolves.toBe('disconnected');
      expect(mcpStdioProbe).not.toHaveBeenCalled();
    });

    it('returns "disconnected" when args is not an array of strings', async () => {
      const source = makeSource('mcp-stdio', { command: 'node', args: [42] });
      const mcpStdioProbe = vi.fn();
      await expect(probeSource(source, { mcpStdioProbe })).resolves.toBe('disconnected');
    });

    it('swallows prober exceptions as "error"', async () => {
      const source = makeSource('mcp-stdio', { command: 'node', args: [] });
      const mcpStdioProbe = vi.fn().mockRejectedValue(new Error('boom'));
      await expect(probeSource(source, { mcpStdioProbe })).resolves.toBe('error');
    });
  });

  describe('managed / unsupported', () => {
    it('returns persisted status for managed (awaits OAuth live mount)', async () => {
      const source = makeSource('managed', { connectorId: 'gmail' }, { status: 'needs_auth' });
      await expect(probeSource(source)).resolves.toBe('needs_auth');
    });
  });
});
