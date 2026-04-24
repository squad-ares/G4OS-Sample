import type { Session, SourceConfigView } from '@g4os/kernel/types';
import type { McpMountRegistry } from '@g4os/sources/broker';
import type { SourcePlan } from '@g4os/sources/planner';
import type { SourcesStore } from '@g4os/sources/store';
import { describe, expect, it, vi } from 'vitest';
import { buildMountedHandlers } from '../mount-plan.ts';

function makeSession(): Session {
  return {
    id: 'sess-1',
    workspaceId: 'ws-1',
    title: 'S',
    status: 'active',
    enabledSourceSlugs: ['gmail', 'local-mcp'],
    stickyMountedSourceSlugs: ['local-mcp'],
    rejectedSourceSlugs: [],
  } as Session;
}

function makeView(overrides: Partial<SourceConfigView>): SourceConfigView {
  return {
    id: 'src-1',
    workspaceId: 'ws-1',
    slug: 'local-mcp',
    kind: 'mcp-stdio',
    displayName: 'Local MCP',
    category: 'other',
    authKind: 'none',
    enabled: true,
    status: 'connected',
    config: { command: 'node', args: ['server.js'] },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as SourceConfigView;
}

function makePlan(brokerFallback: readonly { slug: string; kind: string }[] = []): SourcePlan {
  return {
    nativeDeferred: [],
    brokerFallback: brokerFallback.map((b) => ({
      slug: b.slug,
      displayName: b.slug,
      bucket: 'broker_fallback',
      kind: b.kind as SourceConfigView['kind'],
      status: 'connected',
    })),
    filesystemDirect: [],
    rejected: [],
    sticky: [],
  };
}

function makeStore(views: readonly SourceConfigView[]): SourcesStore {
  return { list: vi.fn().mockResolvedValue(views) } as unknown as SourcesStore;
}

function makeRegistry(mountedTools: readonly { slug: string }[] = []): McpMountRegistry {
  return {
    ensureMounted: vi.fn().mockImplementation((configs: readonly { slug: string }[]) =>
      Promise.resolve(
        configs
          .filter((c) => mountedTools.some((m) => m.slug === c.slug))
          .map((c) => ({
            slug: c.slug,
            source: {} as never,
            tools: [{ name: 'search', description: '', inputSchema: {} }],
          })),
      ),
    ),
  } as unknown as McpMountRegistry;
}

describe('buildMountedHandlers', () => {
  it('returns [] when no mountRegistry is provided', async () => {
    const handlers = await buildMountedHandlers({
      mountRegistry: undefined,
      sourcesStore: makeStore([]),
      plan: makePlan([{ slug: 'local-mcp', kind: 'mcp-stdio' }]),
      session: makeSession(),
    });
    expect(handlers).toEqual([]);
  });

  it('returns [] when session is null', async () => {
    const handlers = await buildMountedHandlers({
      mountRegistry: makeRegistry(),
      sourcesStore: makeStore([]),
      plan: makePlan(),
      session: null,
    });
    expect(handlers).toEqual([]);
  });

  it('only mounts mcp-stdio sources (skips managed)', async () => {
    const registry = makeRegistry([{ slug: 'local-mcp' }]);
    const handlers = await buildMountedHandlers({
      mountRegistry: registry,
      sourcesStore: makeStore([makeView({ slug: 'local-mcp' })]),
      plan: makePlan([
        { slug: 'local-mcp', kind: 'mcp-stdio' },
        { slug: 'gmail', kind: 'managed' },
      ]),
      session: {
        ...makeSession(),
        stickyMountedSourceSlugs: ['local-mcp', 'gmail'],
      } as Session,
    });
    expect(handlers).toHaveLength(1);
    expect(handlers[0]?.definition.name).toBe('mcp_local-mcp__search');
    expect(registry.ensureMounted).toHaveBeenCalledOnce();
    const configsPassed = (registry.ensureMounted as unknown as { mock: { calls: unknown[][] } })
      .mock.calls[0]?.[0];
    expect(configsPassed).toEqual([
      expect.objectContaining({ slug: 'local-mcp', kind: 'mcp-stdio' }),
    ]);
  });

  it('filters out slugs not in stickyMountedSourceSlugs', async () => {
    const registry = makeRegistry([{ slug: 'local-mcp' }]);
    const session = { ...makeSession(), stickyMountedSourceSlugs: [] } as Session;
    const handlers = await buildMountedHandlers({
      mountRegistry: registry,
      sourcesStore: makeStore([makeView({ slug: 'local-mcp' })]),
      plan: makePlan([{ slug: 'local-mcp', kind: 'mcp-stdio' }]),
      session,
    });
    expect(handlers).toEqual([]);
    expect(registry.ensureMounted).not.toHaveBeenCalled();
  });

  it('skips slugs whose SourceConfigView is missing from the store', async () => {
    const registry = makeRegistry([]);
    const handlers = await buildMountedHandlers({
      mountRegistry: registry,
      sourcesStore: makeStore([]), // store empty
      plan: makePlan([{ slug: 'local-mcp', kind: 'mcp-stdio' }]),
      session: makeSession(),
    });
    expect(handlers).toEqual([]);
    expect(registry.ensureMounted).not.toHaveBeenCalled();
  });

  it('synthesizes metadata in SourceConfig.config from SourceConfigView top-level fields', async () => {
    const registry = makeRegistry([{ slug: 'local-mcp' }]);
    await buildMountedHandlers({
      mountRegistry: registry,
      sourcesStore: makeStore([
        makeView({
          slug: 'local-mcp',
          displayName: 'My Local',
          category: 'dev',
          authKind: 'oauth',
        }),
      ]),
      plan: makePlan([{ slug: 'local-mcp', kind: 'mcp-stdio' }]),
      session: makeSession(),
    });
    const configPassed = (
      (registry.ensureMounted as unknown as { mock: { calls: unknown[][] } }).mock
        .calls[0]?.[0] as Array<{ config: { metadata?: Record<string, unknown> } }>
    )[0]?.config.metadata;
    expect(configPassed).toEqual({
      slug: 'local-mcp',
      displayName: 'My Local',
      category: 'dev',
      requiresAuth: true, // authKind !== 'none'
    });
  });
});
