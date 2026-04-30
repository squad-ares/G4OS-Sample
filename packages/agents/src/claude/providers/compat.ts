import { AgentError } from '@g4os/kernel/errors';
import type {
  ClaudeCreateMessageParams,
  ClaudeProvider,
  ClaudeProviderCallContext,
  ClaudeStreamEvent,
} from '../types.ts';

export interface CompatProviderOptions {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly transport?: CompatTransport;
}

export interface CompatTransport {
  fetchStream(
    request: CompatRequest,
    signal: AbortSignal,
  ): Promise<AsyncIterable<ClaudeStreamEvent>>;
}

export interface CompatRequest {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: ClaudeCreateMessageParams;
}

export class CompatProvider implements ClaudeProvider {
  readonly kind = 'compat' as const;

  constructor(private readonly options: CompatProviderOptions) {}

  createMessage(
    params: ClaudeCreateMessageParams,
    context: ClaudeProviderCallContext,
  ): Promise<AsyncIterable<ClaudeStreamEvent>> {
    const transport = this.options.transport;
    if (!transport) {
      return Promise.reject(
        AgentError.unavailable('claude-compat', {
          reason: 'no transport provided to CompatProvider',
        }),
      );
    }
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      ...(this.options.apiKey ? { 'x-api-key': this.options.apiKey } : {}),
      ...(this.options.headers ?? {}),
    };
    return transport
      .fetchStream(
        { url: `${this.options.baseUrl}/v1/messages`, headers, body: params },
        context.signal,
      )
      .catch((cause: unknown) => {
        // Distinguir abort de erro real. Direct provider já faz isso;
        // compat caía sempre em `network` genérico, mascarando turn cancel
        // como "network failure" ao usuário e a observabilidade.
        if (context.signal.aborted) {
          throw AgentError.network('claude-compat', { reason: 'aborted' });
        }
        throw AgentError.network('claude-compat', cause);
      });
  }
}
