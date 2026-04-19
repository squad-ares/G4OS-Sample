import type { AgentFactory, AgentRegistry } from '@g4os/agents/interface';
import { globalAgentRegistry } from '@g4os/agents/interface';

export interface RegisterAgentsOptions {
  readonly registry?: AgentRegistry;
  readonly factories?: readonly AgentFactory[];
}

export function registerAgents(options: RegisterAgentsOptions = {}): AgentRegistry {
  const registry = options.registry ?? globalAgentRegistry;
  for (const factory of options.factories ?? []) {
    registry.register(factory);
  }
  return registry;
}
