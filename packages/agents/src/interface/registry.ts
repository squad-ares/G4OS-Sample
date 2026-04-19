import { AgentError } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import type { AgentConfig, AgentFactory, IAgent } from './agent.ts';

export class AgentRegistry {
  private readonly factories = new Map<string, AgentFactory>();

  register(factory: AgentFactory): void {
    if (this.factories.has(factory.kind)) {
      throw new Error(`Agent kind already registered: ${factory.kind}`);
    }
    this.factories.set(factory.kind, factory);
  }

  unregister(kind: string): boolean {
    return this.factories.delete(kind);
  }

  has(kind: string): boolean {
    return this.factories.has(kind);
  }

  get(kind: string): AgentFactory | undefined {
    return this.factories.get(kind);
  }

  list(): readonly AgentFactory[] {
    return Array.from(this.factories.values());
  }

  resolve(config: AgentConfig): Result<AgentFactory, AgentError> {
    for (const factory of this.factories.values()) {
      if (factory.supports(config)) return ok(factory);
    }
    return err(
      AgentError.unavailable(config.connectionSlug, {
        reason: 'no factory supports connection',
        modelId: config.modelId,
      }),
    );
  }

  create(config: AgentConfig): Result<IAgent, AgentError> {
    return this.resolve(config).map((factory) => factory.create(config));
  }

  clear(): void {
    this.factories.clear();
  }
}

export const globalAgentRegistry = new AgentRegistry();
