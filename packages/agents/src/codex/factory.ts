import type { AgentConfig, AgentFactory, IAgent } from '../interface/agent.ts';
import { AppServerClient } from './app-server/client.ts';
import type { SubprocessSpawner } from './app-server/subprocess.ts';
import { type BinaryResolverOptions, resolveCodexBinary } from './binary-resolver.ts';
import type { BridgeMcpConnector } from './bridge-mcp/connect.ts';
import { CodexAgent, type CodexAgentOptions } from './codex-agent.ts';

const SUPPORTED_SLUG_PREFIXES = ['openai-codex', 'codex'] as const;

export interface CodexFactoryOptions {
  readonly spawner: SubprocessSpawner;
  readonly binaryOptions?: BinaryResolverOptions;
  readonly bridgeMcp?: (config: AgentConfig) => BridgeMcpConnector | undefined;
  readonly agentOptions?: Partial<Omit<CodexAgentOptions, 'appServer' | 'bridgeMcp'>>;
}

export function supportsCodexConnection(connectionSlug: string): boolean {
  return SUPPORTED_SLUG_PREFIXES.some((prefix) => connectionSlug.startsWith(prefix));
}

export function createCodexFactory(options: CodexFactoryOptions): AgentFactory {
  return {
    kind: 'codex',
    supports(config) {
      return supportsCodexConnection(config.connectionSlug);
    },
    create(config): IAgent {
      const command = resolveCodexBinary(options.binaryOptions);
      const client = new AppServerClient({ command, spawner: options.spawner });
      client.start();
      const bridgeMcp = options.bridgeMcp?.(config);
      return new CodexAgent(config, {
        appServer: client,
        ...(bridgeMcp ? { bridgeMcp } : {}),
        ...(options.agentOptions ?? {}),
      });
    },
  };
}
