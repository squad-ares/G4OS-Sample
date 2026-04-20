import type { AgentConfig, AgentFactory, IAgent } from '../interface/agent.ts';
import { GoogleAgent } from './google-agent.ts';
import type { GoogleGenAISdkLike } from './providers/genai-provider.ts';
import { GenAIProvider } from './providers/genai-provider.ts';

export interface GoogleFactoryOptions {
  readonly resolveApiKey: (connectionSlug: string) => string;
  readonly enableNativeRouting?: boolean;
  readonly sdkFactory?: () => Promise<GoogleGenAISdkLike>;
}

const GOOGLE_SLUG_PREFIXES = ['google', 'gemini', 'pi_google', 'pi_gemini'];

export function supportsGoogleConnection(connectionSlug: string): boolean {
  const slug = connectionSlug.toLowerCase();
  return GOOGLE_SLUG_PREFIXES.some((p) => slug.startsWith(p));
}

export function createGoogleFactory(options: GoogleFactoryOptions): AgentFactory {
  return {
    kind: 'google',
    supports(config: AgentConfig): boolean {
      return supportsGoogleConnection(config.connectionSlug);
    },
    create(config: AgentConfig): IAgent {
      const apiKey = options.resolveApiKey(config.connectionSlug);
      const provider = new GenAIProvider({
        apiKey,
        ...(options.sdkFactory === undefined ? {} : { sdkFactory: options.sdkFactory }),
      });
      return new GoogleAgent(config, provider, {
        ...(options.enableNativeRouting === undefined
          ? {}
          : { enableNativeRouting: options.enableNativeRouting }),
      });
    },
  };
}
