import type { AgentConfig, AgentFactory, IAgent } from '../interface/agent.ts';
import { OpenAIAgent } from './openai-agent.ts';
import { CompletionsProvider } from './providers/completions.ts';
import { ResponsesProvider } from './providers/responses.ts';
import type { OpenAIProvider } from './types.ts';

export interface OpenAIFactoryOptions {
  readonly workspaceId?: string;
  readonly resolveApiKey: (connectionSlug: string) => string;
  readonly resolveBaseUrl?: (connectionSlug: string) => string | undefined;
  readonly resolveProtocol?: (config: AgentConfig) => 'completions' | 'responses';
  readonly providerOverride?: OpenAIProvider;
}

const OPENAI_SLUG_PREFIXES = ['openai', 'pi_openai', 'openai_compat', 'openai-compat'] as const;

export function supportsOpenAIConnection(connectionSlug: string): boolean {
  const slug = connectionSlug.toLowerCase();
  return OPENAI_SLUG_PREFIXES.some((p) => slug.startsWith(p));
}

export function createOpenAIFactory(options: OpenAIFactoryOptions): AgentFactory {
  return {
    kind: 'openai',
    supports(config) {
      return supportsOpenAIConnection(config.connectionSlug);
    },
    create(config): IAgent {
      const provider = options.providerOverride ?? buildProvider(config, options);
      return new OpenAIAgent(config, provider, {
        ...(options.workspaceId === undefined ? {} : { workspaceId: options.workspaceId }),
        connectionSlug: config.connectionSlug,
      });
    },
  };
}

function buildProvider(config: AgentConfig, options: OpenAIFactoryOptions): OpenAIProvider {
  const protocol = options.resolveProtocol?.(config) ?? 'completions';
  const apiKey = options.resolveApiKey(config.connectionSlug);
  const baseUrl = options.resolveBaseUrl?.(config.connectionSlug);
  const opts = {
    apiKey,
    ...(baseUrl === undefined ? {} : { baseUrl }),
  };
  return protocol === 'responses' ? new ResponsesProvider(opts) : new CompletionsProvider(opts);
}
