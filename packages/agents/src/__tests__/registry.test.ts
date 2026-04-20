import { DisposableBase } from '@g4os/kernel/disposable';
import { AgentError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import { EMPTY, type Observable } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  AgentCapabilities,
  AgentConfig,
  AgentEvent,
  AgentFactory,
  AgentTurnInput,
  IAgent,
} from '../interface/agent.ts';
import { AgentRegistry } from '../interface/registry.ts';

class FakeAgent extends DisposableBase implements IAgent {
  readonly kind: string;
  readonly capabilities: AgentCapabilities;

  constructor(kind: string, capabilities: AgentCapabilities) {
    super();
    this.kind = kind;
    this.capabilities = capabilities;
  }

  run(_input: AgentTurnInput): Observable<AgentEvent> {
    return EMPTY;
  }

  interrupt(_sessionId: string): Promise<Result<void, AgentError>> {
    return Promise.resolve(ok(undefined));
  }
}

function makeFactory(options: {
  kind: string;
  matchesSlug: string;
  capabilities?: Partial<AgentCapabilities>;
}): AgentFactory {
  const capabilities: AgentCapabilities = {
    family: 'anthropic',
    streaming: true,
    thinking: false,
    toolUse: true,
    promptCaching: true,
    maxContextTokens: 200_000,
    supportedTools: 'all',
    ...options.capabilities,
  };
  return {
    kind: options.kind,
    supports: (config) => config.connectionSlug === options.matchesSlug,
    create: (_config) => new FakeAgent(options.kind, capabilities),
  };
}

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it('registers and lists factories', () => {
    const claude = makeFactory({ kind: 'claude', matchesSlug: 'anthropic-direct' });
    const codex = makeFactory({ kind: 'codex', matchesSlug: 'openai-direct' });
    registry.register(claude);
    registry.register(codex);

    const kinds = registry.list().map((f) => f.kind);
    expect(kinds).toEqual(['claude', 'codex']);
    expect(registry.has('claude')).toBe(true);
    expect(registry.get('codex')).toBe(codex);
  });

  it('rejects duplicate registrations (programming error)', () => {
    registry.register(makeFactory({ kind: 'claude', matchesSlug: 'a' }));
    expect(() => registry.register(makeFactory({ kind: 'claude', matchesSlug: 'b' }))).toThrow(
      /already registered/i,
    );
  });

  it('resolve() returns first factory that supports the config', () => {
    registry.register(makeFactory({ kind: 'claude', matchesSlug: 'anthropic-direct' }));
    registry.register(makeFactory({ kind: 'codex', matchesSlug: 'openai-direct' }));

    const config: AgentConfig = { connectionSlug: 'openai-direct', modelId: 'gpt-5' };
    const resolved = registry.resolve(config);
    expect(resolved.isOk()).toBe(true);
    expect(resolved._unsafeUnwrap().kind).toBe('codex');
  });

  it('create() returns an IAgent wrapping the factory', () => {
    registry.register(
      makeFactory({
        kind: 'claude',
        matchesSlug: 'anthropic-direct',
        capabilities: { family: 'anthropic', maxContextTokens: 1_000_000 },
      }),
    );
    const config: AgentConfig = { connectionSlug: 'anthropic-direct', modelId: 'claude-opus-4-7' };
    const result = registry.create(config);
    expect(result.isOk()).toBe(true);
    const agent = result._unsafeUnwrap();
    expect(agent.kind).toBe('claude');
    expect(agent.capabilities.maxContextTokens).toBe(1_000_000);
    agent.dispose();
  });

  it('create() returns AgentError when no factory supports the config', () => {
    registry.register(makeFactory({ kind: 'claude', matchesSlug: 'anthropic-direct' }));
    const config: AgentConfig = { connectionSlug: 'unknown', modelId: 'mystery-1' };
    const result = registry.create(config);
    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error).toBeInstanceOf(AgentError);
    expect(error.code).toBe(ErrorCode.AGENT_UNAVAILABLE);
    expect(error.context).toMatchObject({ provider: 'unknown' });
  });

  it('unregister() removes a factory and reports absence', () => {
    registry.register(makeFactory({ kind: 'claude', matchesSlug: 'anthropic-direct' }));
    expect(registry.unregister('claude')).toBe(true);
    expect(registry.has('claude')).toBe(false);
    expect(registry.unregister('claude')).toBe(false);
  });

  it('clear() drops all factories', () => {
    registry.register(makeFactory({ kind: 'claude', matchesSlug: 'a' }));
    registry.register(makeFactory({ kind: 'codex', matchesSlug: 'b' }));
    registry.clear();
    expect(registry.list()).toHaveLength(0);
  });

  it('Result chain works idiomatically without try/catch', () => {
    registry.register(makeFactory({ kind: 'claude', matchesSlug: 'anthropic-direct' }));
    const chain = registry
      .create({ connectionSlug: 'anthropic-direct', modelId: 'claude-opus-4-7' })
      .map((agent) => agent.kind)
      .mapErr(() => 'fallback');
    expect(chain.isOk()).toBe(true);
    expect(chain._unsafeUnwrap()).toBe('claude');

    const missing = registry
      .create({ connectionSlug: 'does-not-exist', modelId: 'x' })
      .orElse(() => err('no backend'));
    expect(missing.isErr()).toBe(true);
  });
});
