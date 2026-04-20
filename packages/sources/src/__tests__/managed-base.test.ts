import type { SourceError } from '@g4os/kernel/errors';
import { ok, type Result } from 'neverthrow';
import { type Observable, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { ToolDefinition, ToolResult } from '../interface/source.ts';
import { ManagedConnectorBase, type TokenStore } from '../managed/base.ts';

class FakeTokenStore implements TokenStore {
  private readonly data = new Map<string, string>();
  get(slug: string): Promise<string | null> {
    return Promise.resolve(this.data.get(slug) ?? null);
  }
  set(slug: string, token: string): Promise<void> {
    this.data.set(slug, token);
    return Promise.resolve();
  }
  delete(slug: string): Promise<void> {
    this.data.delete(slug);
    return Promise.resolve();
  }
}

class DemoConnector extends ManagedConnectorBase {
  protected provideTools(): readonly ToolDefinition[] {
    return [{ name: 'demo', description: 'd', inputSchema: {} }];
  }
  protected invokeTool(
    _name: string,
    _input: unknown,
    token: string | null,
  ): Observable<ToolResult> {
    return of({ content: { token }, isError: false });
  }
}

describe('ManagedConnectorBase', () => {
  it('requires auth when token store is empty', async () => {
    const store = new FakeTokenStore();
    const conn = new DemoConnector({
      slug: 'demo',
      metadata: { slug: 'demo', displayName: 'Demo', category: 'other', requiresAuth: true },
      tokenStore: store,
    });
    const result = await conn.activate();
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('source.auth_required');
    conn.dispose();
  });

  it('activates once token is stored', async () => {
    const store = new FakeTokenStore();
    await store.set('demo', 'token-1');
    const conn = new DemoConnector({
      slug: 'demo',
      metadata: { slug: 'demo', displayName: 'Demo', category: 'other', requiresAuth: true },
      tokenStore: store,
    });
    expect((await conn.activate()).isOk()).toBe(true);
    expect((await conn.listTools())._unsafeUnwrap()).toHaveLength(1);
    conn.dispose();
  });

  it('runs provided authenticateFn', async () => {
    const store = new FakeTokenStore();
    const authenticateFn = (): Promise<Result<string, SourceError>> =>
      Promise.resolve(ok('fresh-token'));
    const conn = new DemoConnector({
      slug: 'demo',
      metadata: { slug: 'demo', displayName: 'Demo', category: 'other', requiresAuth: true },
      tokenStore: store,
      authenticateFn,
    });
    const result = await conn.authenticate();
    expect(result.isOk()).toBe(true);
    expect(await store.get('demo')).toBe('fresh-token');
    conn.dispose();
  });
});
