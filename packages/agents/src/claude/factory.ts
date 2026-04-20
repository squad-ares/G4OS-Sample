import type { AgentConfig, AgentFactory, IAgent } from '../interface/agent.ts';
import { ClaudeAgent, type ClaudeAgentOptions } from './claude-agent.ts';
import type { ClaudeProvider } from './types.ts';

const SUPPORTED_SLUG_PREFIXES = ['anthropic', 'claude', 'bedrock-claude', 'claude-compat'] as const;

export interface ClaudeFactoryOptions {
  readonly resolveProvider: (config: AgentConfig) => ClaudeProvider;
  readonly agentOptions?: ClaudeAgentOptions;
}

export function supportsClaudeConnection(connectionSlug: string): boolean {
  return SUPPORTED_SLUG_PREFIXES.some((prefix) => connectionSlug.startsWith(prefix));
}

export function createClaudeFactory(options: ClaudeFactoryOptions): AgentFactory {
  return {
    kind: 'claude',
    supports(config) {
      return supportsClaudeConnection(config.connectionSlug);
    },
    create(config): IAgent {
      const provider = options.resolveProvider(config);
      return new ClaudeAgent(config, provider, options.agentOptions);
    },
  };
}
