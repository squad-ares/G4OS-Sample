import { DisposableBase } from '@g4os/kernel/disposable';
import { SourceError } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import { BehaviorSubject, EMPTY } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SourceRegistry } from '../interface/registry.ts';
import type {
  ISource,
  SourceConfig,
  SourceFactory,
  SourceKind,
  SourceMetadata,
  SourceStatus,
  ToolDefinition,
  ToolResult,
} from '../interface/source.ts';

class FakeSource extends DisposableBase implements ISource {
  readonly kind: SourceKind = 'mcp-stdio';
  readonly slug: string;
  readonly metadata: SourceMetadata;
  private readonly subject = new BehaviorSubject<SourceStatus>('disconnected');

  constructor(
    slug: string,
    private readonly shouldFail = false,
  ) {
    super();
    this.slug = slug;
    this.metadata = {
      slug,
      displayName: slug,
      category: 'dev',
      requiresAuth: false,
    };
  }

  get status$() {
    return this.subject.asObservable();
  }

  activate(): Promise<Result<void, SourceError>> {
    if (this.shouldFail) return Promise.resolve(err(SourceError.authRequired(this.slug)));
    this.subject.next('connected');
    return Promise.resolve(ok(undefined));
  }

  deactivate(): Promise<void> {
    this.subject.next('disconnected');
    return Promise.resolve();
  }

  listTools(): Promise<Result<readonly ToolDefinition[], SourceError>> {
    return Promise.resolve(ok([]));
  }

  callTool() {
    return EMPTY as unknown as import('rxjs').Observable<ToolResult>;
  }
}

function makeFactory(kind: SourceKind, shouldFail = false): SourceFactory {
  return {
    kind,
    supports: (c) => c.kind === kind,
    create: (c) => new FakeSource(c.slug, shouldFail),
  };
}

const mkConfig = (slug: string, kind: SourceKind = 'mcp-stdio'): SourceConfig => ({
  slug,
  kind,
  config: {},
});

describe('SourceRegistry', () => {
  it('registers and activates a source', async () => {
    const reg = new SourceRegistry();
    reg.register(makeFactory('mcp-stdio'));

    const result = await reg.activate(mkConfig('foo'));
    expect(result.isOk()).toBe(true);
    expect(reg.get('foo')).toBeDefined();
    expect(reg.list()).toHaveLength(1);
  });

  it('returns existing instance on duplicate activate', async () => {
    const reg = new SourceRegistry();
    reg.register(makeFactory('mcp-stdio'));

    const first = await reg.activate(mkConfig('foo'));
    const second = await reg.activate(mkConfig('foo'));
    expect(first._unsafeUnwrap()).toBe(second._unsafeUnwrap());
  });

  it('rejects registering same kind twice', () => {
    const reg = new SourceRegistry();
    reg.register(makeFactory('mcp-stdio'));
    expect(() => reg.register(makeFactory('mcp-stdio'))).toThrow();
  });

  it('errors when no factory supports the kind', async () => {
    const reg = new SourceRegistry();
    const result = await reg.activate(mkConfig('foo', 'api'));
    expect(result.isErr()).toBe(true);
  });

  it('propagates activation failure and disposes the source', async () => {
    const reg = new SourceRegistry();
    reg.register(makeFactory('mcp-stdio', true));
    const result = await reg.activate(mkConfig('foo'));
    expect(result.isErr()).toBe(true);
    expect(reg.get('foo')).toBeUndefined();
  });

  it('deactivates and clears instance', async () => {
    const reg = new SourceRegistry();
    reg.register(makeFactory('mcp-stdio'));
    await reg.activate(mkConfig('foo'));
    await reg.deactivate('foo');
    expect(reg.get('foo')).toBeUndefined();
  });
});
