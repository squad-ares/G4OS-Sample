import { AgentError } from '@g4os/kernel/errors';
import type { AgentEvent, AgentTurnInput } from '../../interface/agent.ts';
import { OpenAIEventMapper } from '../event-mapper/event-mapper.ts';
import type { OpenAIProvider, OpenAIStreamParams } from '../types.ts';

export interface StreamRunnerDeps {
  readonly provider: OpenAIProvider;
  readonly buildParams: (input: AgentTurnInput) => OpenAIStreamParams;
}

export class StreamRunner {
  constructor(private readonly deps: StreamRunnerDeps) {}

  async *run(input: AgentTurnInput, signal: AbortSignal): AsyncIterable<AgentEvent> {
    yield { type: 'started', turnId: input.turnId };

    let sawDone = false;
    try {
      sawDone = yield* this.consumeStream(input, signal);
    } catch (cause) {
      if (signal.aborted) {
        yield { type: 'error', error: AgentError.network('openai', { reason: 'aborted' }) };
      } else if (cause instanceof AgentError) {
        yield { type: 'error', error: cause };
      } else {
        yield { type: 'error', error: AgentError.network('openai', cause) };
      }
      yield { type: 'done', reason: 'error' };
      sawDone = true;
    }

    if (!sawDone) {
      yield { type: 'done', reason: signal.aborted ? 'interrupted' : 'stop' };
    }
  }

  private async *consumeStream(
    input: AgentTurnInput,
    signal: AbortSignal,
  ): AsyncGenerator<AgentEvent, boolean, void> {
    const params = this.deps.buildParams(input);
    const mapper = new OpenAIEventMapper();
    const stream = await this.deps.provider.openStream(params, { signal });

    let sawDone = false;
    for await (const chunk of stream) {
      if (signal.aborted) {
        yield { type: 'done', reason: 'interrupted' };
        return true;
      }
      for (const event of mapper.mapChunk(chunk)) {
        yield event;
        if (event.type === 'done') sawDone = true;
      }
    }
    return sawDone;
  }
}
