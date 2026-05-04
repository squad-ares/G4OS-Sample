/**
 * CR6-04 — `McpMountRegistry.ensureMounted` no caminho hot do turn não pode
 * travar se um source MCP ficar pendurado em `activate` ou `listTools`.
 * Verificamos que: (1) timeout devolve subset sem o source travado;
 * (2) source que resolve OK não regride.
 */
import { ok } from 'neverthrow';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { McpMountRegistry } from '../broker/mount-registry.ts';
import type { ISource, SourceConfig, SourceFactory, ToolDefinition } from '../interface/source.ts';

function makeSource(slug: string, opts: { hangActivate?: boolean; hangList?: boolean }): ISource {
  return {
    slug,
    kind: 'mcp-stdio',
    // Fixture alinhada com SourceMetadata: category ∈ SourceCategory, requiresAuth obrigatório.
    metadata: { slug, displayName: slug, category: 'dev', requiresAuth: false },
    status$: new BehaviorSubject<import('../interface/source.ts').SourceStatus>('disconnected'),
    activate: () =>
      opts.hangActivate
        ? new Promise(() => undefined) // nunca resolve
        : Promise.resolve(ok(undefined)),
    deactivate: () => Promise.resolve(),
    listTools: () =>
      opts.hangList
        ? new Promise(() => undefined)
        : Promise.resolve(ok([] as readonly ToolDefinition[])),
    callTool: () => new BehaviorSubject({ content: [], isError: false } as never),
    dispose: () => undefined,
  };
}

function factory(source: ISource): SourceFactory {
  return {
    kind: 'mcp-stdio',
    supports: (c: SourceConfig) => c.slug === source.slug,
    create: () => source,
  };
}

const FAST_TIMEOUT_MS = 50;

describe('McpMountRegistry timeout', () => {
  it('returns empty when activate hangs past timeout', async () => {
    const stuck = makeSource('stuck', { hangActivate: true });
    const registry = new McpMountRegistry({
      factories: [factory(stuck)],
      activateTimeoutMs: FAST_TIMEOUT_MS,
      listToolsTimeoutMs: FAST_TIMEOUT_MS,
    });
    const out = await registry.ensureMounted([{ slug: 'stuck', kind: 'mcp-stdio', config: {} }]);
    expect(out).toHaveLength(0);
    registry.dispose();
  });

  it('returns empty when listTools hangs past timeout', async () => {
    const slow = makeSource('slow', { hangList: true });
    const registry = new McpMountRegistry({
      factories: [factory(slow)],
      activateTimeoutMs: FAST_TIMEOUT_MS,
      listToolsTimeoutMs: FAST_TIMEOUT_MS,
    });
    const out = await registry.ensureMounted([{ slug: 'slow', kind: 'mcp-stdio', config: {} }]);
    expect(out).toHaveLength(0);
    registry.dispose();
  });

  it('does not regress healthy source', async () => {
    const ok = makeSource('ok', {});
    const registry = new McpMountRegistry({
      factories: [factory(ok)],
      activateTimeoutMs: FAST_TIMEOUT_MS,
      listToolsTimeoutMs: FAST_TIMEOUT_MS,
    });
    const out = await registry.ensureMounted([{ slug: 'ok', kind: 'mcp-stdio', config: {} }]);
    expect(out).toHaveLength(1);
    expect(out[0]?.slug).toBe('ok');
    registry.dispose();
  });
});
