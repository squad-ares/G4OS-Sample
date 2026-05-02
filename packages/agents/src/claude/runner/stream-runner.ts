import { AgentError } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import type { AgentEvent, AgentTurnInput } from '../../interface/agent.ts';
import { wrapAgentError } from '../../shared/errors/wrap-agent-error.ts';
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

  async *run(input: AgentTurnInput, signal: AbortSignal): AsyncGenerator<AgentEvent, void, void> {
    yield { type: 'started', turnId: input.turnId };

    const params = this.deps.buildParams(input);
    const state = createEventMapperState();
    let sawDone = false;

    let iterator: AsyncIterator<ClaudeStreamEvent> | undefined;
    try {
      const stream = await this.openStream(params, signal);
      // Usar iterator manual para poder chamar `return()` em abort.
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
      // Também fechar iterator no erro path
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

/**
 * CR-23 F-CR23-4: delega ao `wrapAgentError` shared para paridade com
 * OpenAI/Google (mesma extração de status `cause.status`/`response.status`/
 * `statusCode`, mesmo mapping 401/403→invalidApiKey, 429→rateLimited com
 * `Retry-After` header extraction, 5xx→network, default→unavailable).
 *
 * Preserva duas branches específicas do Claude path:
 *   1. `signal.aborted` → `AgentError.network({reason: 'aborted'})` —
 *      usuário interrompeu via subscriber.unsubscribe; o status do `cause`
 *      pode ser irrelevante (ex.: `AbortError` gerado pelo SDK não tem
 *      status). Precisamos sinalizar abort cedo para o renderer não tratar
 *      como falha de rede.
 *   2. `cause instanceof AgentError` → pass-through. Helper interno do
 *      Claude (ex.: provider compat fallback) já constrói `AgentError`
 *      tipado; encapsular de novo perderia code semântico.
 */
function wrapError(cause: unknown, signal: AbortSignal, providerKind: string): AgentError {
  if (signal.aborted) return AgentError.network(providerKind, { reason: 'aborted' });
  if (cause instanceof AgentError) return cause;
  return wrapAgentError(cause, providerKind);
}
