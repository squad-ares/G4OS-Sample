import { AgentError } from '@g4os/kernel/errors';
import type {
  ClaudeCreateMessageParams,
  ClaudeProvider,
  ClaudeProviderCallContext,
  ClaudeStreamEvent,
} from '../types.ts';

export interface DirectApiProviderOptions {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly defaultHeaders?: Readonly<Record<string, string>>;
  readonly sdkFactory?: () => Promise<DirectSdkLike>;
}

export interface DirectSdkLike {
  readonly messages: {
    stream(
      params: ClaudeCreateMessageParams,
      options: { signal: AbortSignal },
    ): AsyncIterable<ClaudeStreamEvent>;
  };
}

export class DirectApiProvider implements ClaudeProvider {
  readonly kind = 'direct' as const;
  private sdkPromise: Promise<DirectSdkLike> | undefined;

  constructor(private readonly options: DirectApiProviderOptions) {}

  async createMessage(
    params: ClaudeCreateMessageParams,
    context: ClaudeProviderCallContext,
  ): Promise<AsyncIterable<ClaudeStreamEvent>> {
    const sdk = await this.loadSdk();
    try {
      return sdk.messages.stream(params, { signal: context.signal });
    } catch (cause) {
      throw AgentError.network('claude-direct', cause);
    }
  }

  private loadSdk(): Promise<DirectSdkLike> {
    if (!this.sdkPromise) {
      this.sdkPromise = this.options.sdkFactory
        ? this.options.sdkFactory()
        : loadAnthropicSdk(this.options);
    }
    return this.sdkPromise;
  }
}

async function loadAnthropicSdk(options: DirectApiProviderOptions): Promise<DirectSdkLike> {
  const specifier = '@anthropic-ai/sdk';
  const mod = (await import(/* @vite-ignore */ specifier).catch((cause) => {
    throw AgentError.unavailable('claude-direct', {
      reason: '@anthropic-ai/sdk not installed',
      cause,
    });
  })) as { default: new (init: Record<string, unknown>) => DirectSdkLike };
  const Client = mod.default;
  return new Client({
    apiKey: options.apiKey,
    baseURL: options.baseUrl,
    defaultHeaders: options.defaultHeaders,
  });
}
