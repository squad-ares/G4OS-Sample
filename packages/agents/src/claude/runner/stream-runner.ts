import { AgentError } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import type { AgentEvent, AgentTurnInput } from '../../interface/agent.ts';
import type { ClaudeCreateMessageParams, ClaudeProvider, ClaudeStreamEvent } from '../types.ts';
import { createEventMapperState, mapStreamEvent } from './event-mapper.ts';

const log = createLogger('claude-stream-runner');

export interface StreamRunnerOptions {
  readonly providerKind: string;
}

export interface StreamRunnerDeps {
  readonly provider: ClaudeProvider;
  readonly buildParams: (input: AgentTurnInput) => ClaudeCreateMessageParams;
}

export class StreamRunner {
  constructor(
    private readonly deps: StreamRunnerDeps,
    private readonly options: StreamRunnerOptions = { providerKind: 'claude' },
  ) {}

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: (reason: stream runner combina abort handling, error mapping, iterator cleanup e CR7-25 explicit `iterator.return()`. Complexity 17 = 3 try/catch + 2 sinal aborted checks + iterator dance — quebrar em sub-funções perde o flow linear que torna o controle de fluxo legível)
  async *run(input: AgentTurnInput, signal: AbortSignal): AsyncGenerator<AgentEvent, void, void> {
    yield { type: 'started', turnId: input.turnId };

    const params = this.deps.buildParams(input);
    const state = createEventMapperState();
    let sawDone = false;

    let iterator: AsyncIterator<ClaudeStreamEvent> | undefined;
    try {
      const stream = await this.openStream(params, signal);
      // CR7-25: usar iterator manual para poder chamar `return()` em abort.
      // `for await` automaticamente fecha o iterator no `break`, mas `yield`
      // dentro de `for await` + `return` não garante cleanup imediato no
      // upstream (ex.: SSE socket continua open). `iterator.return()`
      // explícito sinaliza ao source pra liberar recursos.
      iterator = stream[Symbol.asyncIterator]();
      while (true) {
        const next = await iterator.next();
        if (next.done) break;
        if (signal.aborted) {
          yield { type: 'done', reason: 'interrupted' };
          sawDone = true;
          // Best-effort: notifica iterator pra fechar conexão upstream
          try {
            await iterator.return?.();
          } catch {
            // best-effort cleanup
          }
          return;
        }
        for (const mapped of mapStreamEvent(next.value, state)) {
          yield mapped;
          if (mapped.type === 'done') sawDone = true;
        }
      }
    } catch (cause) {
      const error = wrapError(cause, signal, this.options.providerKind);
      log.warn(
        { code: error.code, message: error.message, turnId: input.turnId },
        'claude stream runner caught error',
      );
      yield { type: 'error', error };
      yield { type: 'done', reason: 'error' };
      sawDone = true;
      // CR7-25: também fechar iterator no erro path
      try {
        await iterator?.return?.();
      } catch {
        // best-effort
      }
      return;
    }

    if (!sawDone) {
      yield { type: 'done', reason: 'stop' };
    }
  }

  private openStream(
    params: ClaudeCreateMessageParams,
    signal: AbortSignal,
  ): Promise<AsyncIterable<ClaudeStreamEvent>> {
    return this.deps.provider.createMessage(params, { signal });
  }
}

interface ApiErrorLike {
  readonly status?: number;
  readonly message?: string;
}

function extractApiErrorInfo(cause: unknown): ApiErrorLike | null {
  if (cause === null || typeof cause !== 'object') return null;
  const obj = cause as Record<string, unknown>;
  const status = typeof obj['status'] === 'number' ? obj['status'] : undefined;
  const message = typeof obj['message'] === 'string' ? obj['message'] : undefined;
  if (status === undefined && message === undefined) return null;
  return {
    ...(status === undefined ? {} : { status }),
    ...(message === undefined ? {} : { message }),
  };
}

function mapApiError(
  apiError: ApiErrorLike,
  providerKind: string,
  cause: unknown,
): AgentError | null {
  const { status, message } = apiError;
  if (status === 401 || status === 403) {
    return new AgentError({
      code: 'agent.unavailable',
      message: 'Invalid API key — please check your Anthropic key in Settings > Agents',
      context: { provider: providerKind, status },
      cause,
    });
  }
  if (status === 429) return AgentError.rateLimited(providerKind);
  if (message && message.trim().length > 0) {
    return new AgentError({
      code: 'agent.network',
      message: status ? `${providerKind} (${status}): ${message}` : message,
      context: { provider: providerKind, ...(status === undefined ? {} : { status }) },
      cause,
    });
  }
  return null;
}

function wrapError(cause: unknown, signal: AbortSignal, providerKind: string): AgentError {
  if (signal.aborted) return AgentError.network(providerKind, { reason: 'aborted' });
  if (cause instanceof AgentError) return cause;
  const apiError = extractApiErrorInfo(cause);
  const mapped = apiError ? mapApiError(apiError, providerKind, cause) : null;
  return mapped ?? AgentError.network(providerKind, cause);
}
