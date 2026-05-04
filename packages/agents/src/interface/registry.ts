import { AgentError } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import type { AgentConfig, AgentFactory, IAgent } from './agent.ts';

// Normalizar `kind` pra lowercase ANTES de armazenar/lookup.
// Sem isso, registrar `'Claude'` e fazer `resolve({kind:'claude'})` falham
// silenciosamente — registry parecia vazio. Pattern de defensive code:
// força contrato bem definido sem trocar a API.
function normalizeKind(kind: string): string {
  return kind.toLowerCase();
}

export class AgentRegistry {
  private readonly factories = new Map<string, AgentFactory>();

  register(factory: AgentFactory): void {
    const key = normalizeKind(factory.kind);
    if (this.factories.has(key)) {
      throw new Error(`Agent kind already registered: ${factory.kind}`);
    }
    this.factories.set(key, factory);
  }

  unregister(kind: string): boolean {
    return this.factories.delete(normalizeKind(kind));
  }

  has(kind: string): boolean {
    return this.factories.has(normalizeKind(kind));
  }

  get(kind: string): AgentFactory | undefined {
    return this.factories.get(normalizeKind(kind));
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
    // CR-18 F-AG2: `factory.create` pode jogar exceção (CodexAgent
    // `resolveCodexBinary` lança quando binário não está disponível;
    // ClaudeAgent `resolveProvider` lança se host não carregou credentials
    // ainda). `neverthrow.map` NÃO captura throws sync, então o `Result<T,E>`
    // anunciado pela API era contornado em silêncio. Convertemos throws em
    // `err(AgentError.factoryFailed)` preservando a cause.
    return this.resolve(config).andThen((factory) => {
      try {
        return ok(factory.create(config));
      } catch (cause) {
        if (cause instanceof AgentError) return err(cause);
        return err(
          AgentError.unavailable(config.connectionSlug, {
            reason: 'factory threw',
            modelId: config.modelId,
            cause: cause instanceof Error ? cause.message : String(cause),
          }),
        );
      }
    });
  }

  clear(): void {
    this.factories.clear();
  }
}

export const globalAgentRegistry = new AgentRegistry();
