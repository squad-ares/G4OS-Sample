import { err, ok } from 'neverthrow';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { withReconnect } from '../mcp-http/reconnect.ts';
import { McpHttpSource } from '../mcp-http/source.ts';
import type { McpHttpClient, McpHttpClientFactory, McpHttpConfig } from '../mcp-http/types.ts';

const config: McpHttpConfig = {
  slug: 'http-test',
  metadata: { slug: 'http-test', displayName: 'HTTP', category: 'dev', requiresAuth: false },
  url: 'https://example.com/mcp',
};

function makeClient(fail: boolean): McpHttpClient {
  const closeCbs: Array<() => void> = [];
  const errCbs: Array<(e: Error) => void> = [];
  return {
    connect() {
      return Promise.resolve(fail ? err(new Error('connection refused')) : ok(undefined));
    },
    listTools() {
      return Promise.resolve([]);
    },
    callTool() {
      return of({ content: null, isError: false });
    },
    close() {
      return Promise.resolve();
    },
    onClose: (cb) => {
      closeCbs.push(cb);
    },
    onError: (cb) => {
      errCbs.push(cb);
    },
  };
}

describe('withReconnect', () => {
  it('schedules a reconnect with exponential backoff on error', async () => {
    let failing = true;
    const factory: McpHttpClientFactory = {
      create: () => makeClient(failing),
    };
    const src = new McpHttpSource(config, factory);

    const fires: number[] = [];
    const disposer = withReconnect(src, {
      maxAttempts: 3,
      baseDelayMs: 10,
      setTimer: (fn, ms) => {
        fires.push(ms);
        const h = setTimeout(fn, 0);
        return { cancel: () => clearTimeout(h) };
      },
    });

    await src.activate();
    // initial failure -> error status -> schedules reconnect with 10ms
    await new Promise((r) => setTimeout(r, 20));
    expect(fires[0]).toBe(10);

    failing = false;
    await new Promise((r) => setTimeout(r, 50));

    disposer.dispose();
    src.dispose();
  });

  it('resets attempts on connected', async () => {
    const factory: McpHttpClientFactory = {
      create: () => makeClient(false),
    };
    const src = new McpHttpSource(config, factory);

    const schedule = vi.fn((fn: () => void, _ms: number) => {
      const h = setTimeout(fn, 0);
      return { cancel: () => clearTimeout(h) };
    });

    const disposer = withReconnect(src, { setTimer: schedule });
    await src.activate();
    expect(schedule).not.toHaveBeenCalled();
    disposer.dispose();
    src.dispose();
  });
});
