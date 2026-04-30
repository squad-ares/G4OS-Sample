import { SourceError } from '@g4os/kernel/errors';
import { err, ok } from 'neverthrow';
import { EMPTY, of, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { McpMountRegistry } from '../broker/mount-registry.ts';
import type {
  ISource,
  SourceConfig,
  SourceFactory,
  SourceStatus,
  ToolDefinition,
  ToolResult,
} from '../interface/index.ts';

function makeSource(overrides: Partial<ISource> = {}): ISource {
  const status$ = new Subject<SourceStatus>();
  const base: ISource = {
    slug: 'fake',
    kind: 'mcp-stdio',
    metadata: {
      slug: 'fake',
      displayName: 'Fake',
      category: 'other',
      requiresAuth: false,
    },
    status$,
    activate: vi.fn().mockResolvedValue(ok(undefined)),
    deactivate: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue(
      ok([
        {
          name: 'search',
          description: 'do search',
          inputSchema: { type: 'object' },
        } satisfies ToolDefinition,
      ]),
    ),
    callTool: vi.fn().mockReturnValue(EMPTY),
    dispose: vi.fn(),
  };
  return { ...base, ...overrides };
}

function makeFactory(source: ISource): SourceFactory {
  return {
    kind: 'mcp-stdio',
    supports: (c: SourceConfig) => c.kind === 'mcp-stdio',
    create: vi.fn().mockReturnValue(source),
  };
}

const CONFIG: SourceConfig = {
  slug: 'fake',
  kind: 'mcp-stdio',
  config: { command: 'node', args: ['s.js'] },
};

describe('McpMountRegistry', () => {
  it('activates a source on first ensureMounted and returns its tools', async () => {
    const source = makeSource();
    const registry = new McpMountRegistry({ factories: [makeFactory(source)] });
    const mounted = await registry.ensureMounted([CONFIG]);
    expect(mounted).toHaveLength(1);
    expect(mounted[0]?.slug).toBe('fake');
    expect(mounted[0]?.tools[0]?.name).toBe('search');
    expect(source.activate).toHaveBeenCalledOnce();
    expect(source.listTools).toHaveBeenCalledOnce();
    registry.dispose();
  });

  it('reuses the cached source on subsequent ensureMounted calls', async () => {
    const source = makeSource();
    const registry = new McpMountRegistry({ factories: [makeFactory(source)] });
    await registry.ensureMounted([CONFIG]);
    await registry.ensureMounted([CONFIG]);
    expect(source.activate).toHaveBeenCalledTimes(1); // cache hit on second
    registry.dispose();
  });

  it('skips sources without a matching factory', async () => {
    const registry = new McpMountRegistry({ factories: [] });
    const mounted = await registry.ensureMounted([CONFIG]);
    expect(mounted).toEqual([]);
  });

  it('skips sources whose activate() returns err', async () => {
    const source = makeSource({
      activate: vi.fn().mockResolvedValue(err(SourceError.incompatible('fake', 'nope'))),
    });
    const registry = new McpMountRegistry({ factories: [makeFactory(source)] });
    const mounted = await registry.ensureMounted([CONFIG]);
    expect(mounted).toEqual([]);
    expect(source.listTools).not.toHaveBeenCalled();
    registry.dispose();
  });

  it('skips sources whose listTools() returns err and deactivates them', async () => {
    const source = makeSource({
      listTools: vi.fn().mockResolvedValue(err(SourceError.incompatible('fake', 'broken'))),
    });
    const registry = new McpMountRegistry({ factories: [makeFactory(source)] });
    const mounted = await registry.ensureMounted([CONFIG]);
    expect(mounted).toEqual([]);
    expect(source.deactivate).toHaveBeenCalledOnce();
    registry.dispose();
  });

  it('unmount deactivates + disposes a mounted source and removes it from cache', async () => {
    const source = makeSource();
    const registry = new McpMountRegistry({ factories: [makeFactory(source)] });
    await registry.ensureMounted([CONFIG]);
    expect(registry.getMounted('fake')).toBeDefined();

    await registry.unmount('fake');
    expect(registry.getMounted('fake')).toBeUndefined();
    expect(source.deactivate).toHaveBeenCalledOnce();
    expect(source.dispose).toHaveBeenCalledOnce();
    registry.dispose();
  });

  it('dispose deactivates + disposes all mounted sources', async () => {
    const sourceA = makeSource({ slug: 'a' });
    const sourceB = makeSource({ slug: 'b' });
    const factories: readonly SourceFactory[] = [
      {
        kind: 'mcp-stdio',
        supports: (c) => c.slug === 'a',
        create: vi.fn().mockReturnValue(sourceA),
      },
      {
        kind: 'mcp-stdio',
        supports: (c) => c.slug === 'b',
        create: vi.fn().mockReturnValue(sourceB),
      },
    ];
    const registry = new McpMountRegistry({ factories });
    await registry.ensureMounted([
      { slug: 'a', kind: 'mcp-stdio', config: {} },
      { slug: 'b', kind: 'mcp-stdio', config: {} },
    ]);
    expect(registry.getAll()).toHaveLength(2);
    registry.dispose();
    expect(sourceA.dispose).toHaveBeenCalled();
    expect(sourceB.dispose).toHaveBeenCalled();
  });

  it('getAll returns the full set of mounted sources', async () => {
    const source = makeSource();
    const registry = new McpMountRegistry({ factories: [makeFactory(source)] });
    await registry.ensureMounted([CONFIG]);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getAll()[0]?.slug).toBe('fake');
    registry.dispose();
  });

  it('returns only successfully mounted sources when a subset fails', async () => {
    const sourceOK = makeSource({ slug: 'ok' });
    const sourceBad = makeSource({
      slug: 'bad',
      activate: vi.fn().mockResolvedValue(err(SourceError.incompatible('bad', 'x'))),
    });
    const factories: readonly SourceFactory[] = [
      {
        kind: 'mcp-stdio',
        supports: (c) => c.slug === 'ok',
        create: vi.fn().mockReturnValue(sourceOK),
      },
      {
        kind: 'mcp-stdio',
        supports: (c) => c.slug === 'bad',
        create: vi.fn().mockReturnValue(sourceBad),
      },
    ];
    const registry = new McpMountRegistry({ factories });
    const mounted = await registry.ensureMounted([
      { slug: 'ok', kind: 'mcp-stdio', config: {} },
      { slug: 'bad', kind: 'mcp-stdio', config: {} },
    ]);
    expect(mounted.map((m) => m.slug)).toEqual(['ok']);
    registry.dispose();
  });
});

describe('buildMountedToolHandlers', () => {
  it('namespaces tool names as mcp_<slug>__<toolname>', async () => {
    const { buildMountedToolHandlers } = await import('../broker/tool-adapter.ts');
    const source = makeSource();
    const out = buildMountedToolHandlers([
      {
        slug: 'gmail',
        source,
        tools: [
          { name: 'search-messages', description: 'find', inputSchema: {} },
          { name: 'draft', description: 'make draft', inputSchema: {} },
        ],
      },
    ]);
    expect(out.definitions.map((d) => d.name)).toEqual([
      'mcp_gmail__search-messages',
      'mcp_gmail__draft',
    ]);
    expect(out.handlers).toHaveLength(2);
  });

  it('handler.execute dispatches callTool(originalName) on the source', async () => {
    const { buildMountedToolHandlers } = await import('../broker/tool-adapter.ts');
    const callTool = vi
      .fn()
      .mockReturnValue(of({ content: 'ok', isError: false } satisfies ToolResult));
    const source = makeSource({ callTool });
    const out = buildMountedToolHandlers([
      { slug: 'gmail', source, tools: [{ name: 'search', description: '', inputSchema: {} }] },
    ]);
    const handler = out.handlers[0];
    expect(handler).toBeDefined();
    const controller = new AbortController();
    const result = await handler?.execute(
      { q: 'x' },
      {
        sessionId: 's',
        turnId: 't',
        toolUseId: 'tu',
        workingDirectory: '/tmp',
        signal: controller.signal,
      },
    );
    expect(result?.isOk()).toBe(true);
    expect(callTool).toHaveBeenCalledWith('search', { q: 'x' }, controller.signal);
  });

  it('handler.execute maps ToolResult.isError=true to ToolFailure', async () => {
    const { buildMountedToolHandlers } = await import('../broker/tool-adapter.ts');
    const callTool = vi
      .fn()
      .mockReturnValue(of({ content: 'bad', isError: true } satisfies ToolResult));
    const source = makeSource({ callTool });
    const out = buildMountedToolHandlers([
      { slug: 'x', source, tools: [{ name: 't', description: '', inputSchema: {} }] },
    ]);
    const controller = new AbortController();
    const result = await out.handlers[0]?.execute(
      {},
      {
        sessionId: 's',
        turnId: 't',
        toolUseId: 'tu',
        workingDirectory: '/tmp',
        signal: controller.signal,
      },
    );
    expect(result?.isErr()).toBe(true);
  });

  // CR12-S4: dois ensureMounted concorrentes não criam dois subprocessos.
  it('coalesce mounts in-flight para o mesmo slug', async () => {
    let resolveActivate: (() => void) | null = null;
    const source = makeSource({
      activate: vi.fn(
        () =>
          new Promise((resolve) => {
            resolveActivate = () => resolve(ok(undefined));
          }),
      ),
    });
    const factory = makeFactory(source);
    const registry = new McpMountRegistry({ factories: [factory] });

    const a = registry.ensureMounted([CONFIG]);
    const b = registry.ensureMounted([CONFIG]);
    resolveActivate?.();
    const [resA, resB] = await Promise.all([a, b]);

    expect(factory.create).toHaveBeenCalledTimes(1);
    expect(source.activate).toHaveBeenCalledTimes(1);
    expect(resA[0]?.slug).toBe('fake');
    expect(resB[0]?.slug).toBe('fake');
    // Mesma instância retornada para ambos.
    expect(resA[0]).toBe(resB[0]);
    registry.dispose();
  });
});
