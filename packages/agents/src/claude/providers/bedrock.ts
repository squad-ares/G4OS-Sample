import { AgentError } from '@g4os/kernel/errors';
import type {
  ClaudeCreateMessageParams,
  ClaudeProvider,
  ClaudeProviderCallContext,
  ClaudeStreamEvent,
} from '../types.ts';

export interface BedrockProviderOptions {
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
  readonly sdkFactory?: () => Promise<BedrockRuntimeLike>;
}

export interface BedrockRuntimeLike {
  invokeWithResponseStream(params: {
    readonly params: ClaudeCreateMessageParams;
    readonly signal: AbortSignal;
  }): Promise<AsyncIterable<ClaudeStreamEvent>>;
}

export class BedrockProvider implements ClaudeProvider {
  readonly kind = 'bedrock' as const;
  private runtimePromise: Promise<BedrockRuntimeLike> | undefined;

  constructor(private readonly options: BedrockProviderOptions) {}

  async createMessage(
    params: ClaudeCreateMessageParams,
    context: ClaudeProviderCallContext,
  ): Promise<AsyncIterable<ClaudeStreamEvent>> {
    const runtime = await this.loadRuntime();
    try {
      return runtime.invokeWithResponseStream({ params, signal: context.signal });
    } catch (cause) {
      throw AgentError.network('claude-bedrock', cause);
    }
  }

  private loadRuntime(): Promise<BedrockRuntimeLike> {
    // Limpar cache em rejeição — caso contrário um SigV4 runtime
    // que falhou na inicialização permanece quebrado para sempre.
    if (!this.runtimePromise) {
      const promise = this.options.sdkFactory
        ? this.options.sdkFactory()
        : Promise.reject(
            AgentError.unavailable('claude-bedrock', {
              reason:
                '@aws-sdk/client-bedrock-runtime factory not provided; Bedrock requires host-provided SigV4 runtime',
            }),
          );
      this.runtimePromise = promise;
      promise.catch(() => {
        if (this.runtimePromise === promise) this.runtimePromise = undefined;
      });
    }
    return this.runtimePromise;
  }
}
