import { AgentError } from '@g4os/kernel/errors';
import type { AgentEvent, AgentTurnInput } from '../../interface/agent.ts';
import type { ClaudeCreateMessageParams, ClaudeProvider, ClaudeStreamEvent } from '../types.ts';
import { createEventMapperState, mapStreamEvent } from './event-mapper.ts';

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

    try {
      const stream = await this.openStream(params, signal);
      for await (const event of stream) {
        if (signal.aborted) {
          yield { type: 'done', reason: 'interrupted' };
          sawDone = true;
          return;
        }
        for (const mapped of mapStreamEvent(event, state)) {
          yield mapped;
          if (mapped.type === 'done') sawDone = true;
        }
      }
    } catch (cause) {
      const error = wrapError(cause, signal, this.options.providerKind);
      yield { type: 'error', error };
      yield { type: 'done', reason: 'error' };
      sawDone = true;
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

function wrapError(cause: unknown, signal: AbortSignal, providerKind: string): AgentError {
  if (signal.aborted) {
    return AgentError.network(providerKind, { reason: 'aborted' });
  }
  if (cause instanceof AgentError) return cause;
  return AgentError.network(providerKind, cause);
}
