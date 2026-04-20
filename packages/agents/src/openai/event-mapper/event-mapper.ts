import type { AgentDoneReason, AgentEvent } from '../../interface/agent.ts';
import { OpenAIToolAccumulator } from '../runner/tool-accumulator.ts';
import type { OpenAIStreamChunk } from '../types.ts';

const FINISH_REASON: Readonly<Record<string, AgentDoneReason>> = {
  stop: 'stop',
  length: 'max_tokens',
  tool_calls: 'tool_use',
  content_filter: 'stop',
};

export class OpenAIEventMapper {
  private readonly accumulator = new OpenAIToolAccumulator();
  private readonly startedIndexes = new Set<number>();

  mapChunk(chunk: OpenAIStreamChunk): AgentEvent[] {
    if (chunk.type === 'text_delta') {
      return [{ type: 'text_delta', text: chunk.text }];
    }
    if (chunk.type === 'reasoning_delta') {
      return [{ type: 'thinking_delta', text: chunk.text }];
    }
    if (chunk.type === 'tool_call_delta') {
      return this.mapToolDelta(chunk);
    }
    if (chunk.type === 'usage') {
      return [
        {
          type: 'usage',
          input: chunk.input,
          output: chunk.output,
          ...(chunk.cacheRead === undefined ? {} : { cacheRead: chunk.cacheRead }),
        },
      ];
    }
    return this.mapDone(chunk.finishReason);
  }

  private mapToolDelta(
    chunk: Extract<OpenAIStreamChunk, { type: 'tool_call_delta' }>,
  ): AgentEvent[] {
    const events: AgentEvent[] = [];
    const isNew = !this.accumulator.has(chunk.index);
    this.accumulator.pushDelta(chunk.index, chunk.id, chunk.name, chunk.argumentsChunk);
    if (isNew && chunk.id !== undefined && chunk.name !== undefined) {
      this.startedIndexes.add(chunk.index);
      events.push({ type: 'tool_use_start', toolUseId: chunk.id, toolName: chunk.name });
    }
    if (chunk.argumentsChunk !== undefined && chunk.argumentsChunk.length > 0) {
      const id = chunk.id ?? '';
      if (id.length > 0) {
        events.push({
          type: 'tool_use_input_delta',
          toolUseId: id,
          partial: chunk.argumentsChunk,
        });
      }
    }
    return events;
  }

  private mapDone(finishReason: string): AgentEvent[] {
    const events: AgentEvent[] = [];
    for (const call of this.accumulator.finalize()) {
      if (call.id.length === 0) continue;
      events.push({
        type: 'tool_use_complete',
        toolUseId: call.id,
        input: this.accumulator.parseInput(call.argumentsText),
      });
    }
    events.push({ type: 'done', reason: FINISH_REASON[finishReason] ?? 'stop' });
    return events;
  }
}
