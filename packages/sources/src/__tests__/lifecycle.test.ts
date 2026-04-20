import { DisposableBase } from '@g4os/kernel/disposable';
import { SourceError } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import { BehaviorSubject, EMPTY } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { SourceRegistry } from '../interface/registry.ts';
import type {
  ISource,
  SourceKind,
  SourceStatus,
  ToolDefinition,
  ToolResult,
} from '../interface/source.ts';
import { SourceIntentDetector } from '../lifecycle/intent-detector.ts';
import { SourceLifecycleManager } from '../lifecycle/lifecycle-manager.ts';

class StubSource extends DisposableBase implements ISource {
  readonly kind: SourceKind = 'mcp-stdio';
  readonly slug: string;
  readonly metadata;
  private readonly subject = new BehaviorSubject<SourceStatus>('disconnected');

  constructor(
    slug: string,
    private readonly outcome: 'ok' | 'auth' | 'fail',
  ) {
    super();
    this.slug = slug;
    this.metadata = { slug, displayName: slug, category: 'dev' as const, requiresAuth: false };
  }

  get status$() {
    return this.subject.asObservable();
  }
  activate(): Promise<Result<void, SourceError>> {
    if (this.outcome === 'ok') return Promise.resolve(ok(undefined));
    if (this.outcome === 'auth') return Promise.resolve(err(SourceError.authRequired(this.slug)));
    return Promise.resolve(err(SourceError.incompatible(this.slug, 'boom')));
  }
  deactivate(): Promise<void> {
    return Promise.resolve();
  }
  listTools(): Promise<Result<readonly ToolDefinition[], SourceError>> {
    return Promise.resolve(ok([]));
  }
  callTool() {
    return EMPTY as unknown as import('rxjs').Observable<ToolResult>;
  }
}

describe('SourceIntentDetector', () => {
  const detector = new SourceIntentDetector();
  const available = [
    { slug: 'gmail', displayName: 'Gmail' },
    { slug: 'github', displayName: 'GitHub' },
  ];

  it('detects explicit [source:slug]', () => {
    const intent = detector.detect('query [source:gmail]', { availableSources: available });
    expect(intent.kind).toBe('explicit');
    expect(intent.sources).toEqual(['gmail']);
  });

  it('detects @mentions against available sources', () => {
    const intent = detector.detect('ask @github about PRs', { availableSources: available });
    expect(intent.kind).toBe('mention');
    expect(intent.sources).toEqual(['github']);
  });

  it('returns skill-required when provided', () => {
    const intent = detector.detect('hi', {
      availableSources: available,
      requiredBySkill: ['gmail'],
    });
    expect(intent.kind).toBe('skill-required');
  });

  it('detects soft mention by display name', () => {
    const intent = detector.detect('please search GitHub issues', { availableSources: available });
    expect(intent.kind).toBe('soft');
    expect(intent.sources).toEqual(['github']);
  });

  it('returns none when nothing matches', () => {
    const intent = detector.detect('hello world', { availableSources: available });
    expect(intent.kind).toBe('none');
  });
});

describe('SourceLifecycleManager', () => {
  function setup(outcomes: Record<string, 'ok' | 'auth' | 'fail'>) {
    const reg = new SourceRegistry();
    // inject sources directly (bypass factory)
    for (const [slug, outcome] of Object.entries(outcomes)) {
      const src = new StubSource(slug, outcome);
      // biome-ignore lint/suspicious/noExplicitAny: reaching into registry internals for test isolation
      (reg as any).instances.set(slug, src);
    }
    const mgr = new SourceLifecycleManager(reg, new SourceIntentDetector());
    return { reg, mgr };
  }

  it('plans turn with sticky + requested minus rejected', () => {
    const { mgr } = setup({});
    mgr.markRejected('s1', 'gmail');
    const plan = mgr.planTurn({
      sessionId: 's1',
      message: '[source:gmail] [source:github]',
      context: {
        availableSources: [
          { slug: 'gmail', displayName: 'Gmail' },
          { slug: 'github', displayName: 'GitHub' },
        ],
      },
    });
    expect(plan.intent.kind).toBe('explicit');
    expect(plan.brokeredSources).toEqual(['github']);
  });

  it('activates brokered sources and marks sticky', async () => {
    const { mgr } = setup({ gmail: 'ok' });
    const result = await mgr.activateBrokered('s1', ['gmail']);
    expect(result.activated).toEqual(['gmail']);
    expect(mgr.stickyFor('s1')).toEqual(['gmail']);
  });

  it('separates needs_auth vs failed vs activated', async () => {
    const { mgr } = setup({ a: 'ok', b: 'auth', c: 'fail' });
    const result = await mgr.activateBrokered('s1', ['a', 'b', 'c', 'missing']);
    expect(result.activated).toEqual(['a']);
    expect(result.needsAuth).toEqual(['b']);
    expect(result.failed.map((f) => f.slug)).toEqual(['c', 'missing']);
  });

  it('clearSession drops sticky and rejected state', async () => {
    const { mgr } = setup({ gmail: 'ok' });
    await mgr.activateBrokered('s1', ['gmail']);
    mgr.markRejected('s1', 'github');
    mgr.clearSession('s1');
    expect(mgr.stickyFor('s1')).toEqual([]);
    expect(mgr.isRejected('s1', 'github')).toBe(false);
  });
});
