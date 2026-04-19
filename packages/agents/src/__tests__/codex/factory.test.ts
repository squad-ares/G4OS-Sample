import { describe, expect, it } from 'vitest';
import type { Subprocess, SubprocessSpawner } from '../../codex/app-server/subprocess.ts';
import { BridgeMcpConnector } from '../../codex/bridge-mcp/connect.ts';
import { createCodexFactory, supportsCodexConnection } from '../../codex/factory.ts';

class StubSubprocess implements Subprocess {
  readonly stdout: AsyncIterable<string> = {
    [Symbol.asyncIterator]: () => ({
      next: () => Promise.resolve({ value: undefined as unknown as string, done: true }),
    }),
  };
  readonly exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }> = Promise.resolve({
    code: 0,
    signal: null,
  });
  write(_chunk: string): Promise<void> {
    return Promise.resolve();
  }
  kill(): void {
    this.disposed = true;
  }
  disposed = false;
}

class StubSpawner implements SubprocessSpawner {
  readonly kind = 'stub' as const;
  readonly children: StubSubprocess[] = [];
  spawn(): Subprocess {
    const child = new StubSubprocess();
    this.children.push(child);
    return child;
  }
}

describe('supportsCodexConnection', () => {
  it('accepts openai-codex / codex prefixes', () => {
    expect(supportsCodexConnection('openai-codex-direct')).toBe(true);
    expect(supportsCodexConnection('codex-cli')).toBe(true);
  });
  it('rejects unrelated slugs', () => {
    expect(supportsCodexConnection('anthropic-direct')).toBe(false);
  });
});

describe('createCodexFactory', () => {
  it('resolves bundled binary, starts AppServer, returns CodexAgent', () => {
    const spawner = new StubSpawner();
    const factory = createCodexFactory({
      spawner,
      binaryOptions: {
        env: () => undefined,
        bundledBinary: () => '/runtime/codex',
        fileExists: () => true,
      },
    });
    expect(factory.kind).toBe('codex');
    const agent = factory.create({
      connectionSlug: 'openai-codex',
      modelId: 'gpt-5-codex',
    });
    expect(agent.kind).toBe('codex');
    expect(spawner.children).toHaveLength(1);
    agent.dispose();
  });

  it('supports() uses the prefix check', () => {
    const factory = createCodexFactory({
      spawner: new StubSpawner(),
      binaryOptions: { env: () => undefined, bundledBinary: () => '/x', fileExists: () => true },
    });
    expect(factory.supports({ connectionSlug: 'openai-codex', modelId: 'x' })).toBe(true);
    expect(factory.supports({ connectionSlug: 'anthropic-direct', modelId: 'x' })).toBe(false);
  });

  it('bridgeMcp callback is invoked with config on create()', () => {
    const spawner = new StubSpawner();
    const calls: string[] = [];
    const factory = createCodexFactory({
      spawner,
      binaryOptions: {
        env: () => '/prod/codex',
        fileExists: () => true,
      },
      bridgeMcp: (config) => {
        calls.push(config.modelId);
        return new BridgeMcpConnector({ url: 'ws://localhost/mcp' });
      },
    });
    const agent = factory.create({
      connectionSlug: 'openai-codex',
      modelId: 'gpt-5-codex',
    });
    expect(calls).toEqual(['gpt-5-codex']);
    agent.dispose();
  });
});
