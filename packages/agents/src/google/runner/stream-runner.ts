import { AgentError } from '@g4os/kernel/errors';
import type { AgentDoneReason, AgentEvent, AgentTurnInput } from '../../interface/agent.ts';
import { wrapAgentError } from '../../shared/errors/wrap-agent-error.ts';
import { resolveThinkingConfig } from '../../shared/thinking/level-resolver.ts';
import { buildGeminiStreamParams } from '../config/mapper.ts';
import { GeminiEventMapper } from '../event-mapper/event-mapper.ts';
import type { GeminiProvider, GeminiStreamParams, GeminiTurnStrategy } from '../types.ts';

const NATIVE_STRATEGY_TOOLS: Record<
  Extract<GeminiTurnStrategy, 'native_search' | 'native_url_context' | 'native_youtube'>,
  object[]
> = {
  native_search: [{ googleSearch: {} }],
  native_url_context: [{ urlContext: {} }],
  native_youtube: [{ urlContext: {} }],
};

export class StreamRunner {
  constructor(private readonly provider: GeminiProvider) {}

  async *run(
    input: AgentTurnInput,
    strategy: GeminiTurnStrategy,
    signal: AbortSignal,
  ): AsyncGenerator<AgentEvent, void, void> {
    yield { type: 'started', turnId: input.turnId };

    const mapper = new GeminiEventMapper();
    for (const tool of input.config.tools ?? []) {
      mapper.registerOriginalToolName(tool.name);
    }

    const params = this.buildParams(input, strategy);
    let sawDone = false;

    try {
      sawDone = yield* this.consumeStream(params, mapper, signal);
    } catch (cause) {
      sawDone = yield* this.handleError(cause, signal);
    }

    if (!sawDone) {
      yield { type: 'done', reason: 'stop' };
    }
  }

  private buildParams(input: AgentTurnInput, strategy: GeminiTurnStrategy): GeminiStreamParams {
    const base = buildGeminiStreamParams(input.config, input.messages);
    const thinkingCfg = resolveThinkingConfig(
      input.config.thinkingLevel,
      'google',
      input.config.modelId,
    );

    return {
      ...base,
      strategy,
      ...(strategy === 'custom_tools'
        ? {}
        : {
            tools: NATIVE_STRATEGY_TOOLS[strategy as keyof typeof NATIVE_STRATEGY_TOOLS] as never[],
          }),
      ...(thinkingCfg.provider === 'google'
        ? {
            thinkingConfig: {
              ...(thinkingCfg.thinkingBudget === 'dynamic' ||
              thinkingCfg.thinkingBudget === undefined
                ? {}
                : { thinkingBudget: thinkingCfg.thinkingBudget }),
            },
          }
        : {}),
    };
  }

  private async *consumeStream(
    params: GeminiStreamParams,
    mapper: GeminiEventMapper,
    signal: AbortSignal,
  ): AsyncGenerator<AgentEvent, boolean, void> {
    const stream = await this.provider.openStream(params, { signal });
    let sawDone = false;
    for await (const chunk of stream) {
      if (signal.aborted) {
        yield { type: 'done', reason: 'interrupted' as AgentDoneReason };
        return true;
      }
      for (const event of mapper.mapChunk(chunk)) {
        yield event;
        if (event.type === 'done') sawDone = true;
      }
    }
    return sawDone;
  }

  private *handleError(cause: unknown, signal: AbortSignal): Generator<AgentEvent, boolean, void> {
    const error = signal.aborted
      ? AgentError.network('google', { reason: 'aborted' })
      : wrapAgentError(cause, 'google');
    yield { type: 'error', error };
    yield { type: 'done', reason: 'error' };
    return true;
  }
}
