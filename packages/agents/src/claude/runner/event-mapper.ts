import type { AgentDoneReason, AgentEvent } from '../../interface/agent.ts';
import type { ClaudeStreamEvent } from '../types.ts';
import { parseToolInput, ToolUseAccumulator } from './tool-accumulator.ts';

export interface EventMapperState {
  readonly accumulator: ToolUseAccumulator;
}

export function createEventMapperState(): EventMapperState {
  return { accumulator: new ToolUseAccumulator() };
}

export function mapStopReason(
  reason: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop_sequence' | undefined,
): AgentDoneReason {
  if (reason === 'max_tokens') return 'max_tokens';
  if (reason === 'tool_use') return 'tool_use';
  return 'stop';
}

export function mapStreamEvent(
  event: ClaudeStreamEvent,
  state: EventMapperState,
): readonly AgentEvent[] {
  switch (event.type) {
    case 'message_start':
      return [];

    case 'content_block_start': {
      const block = event.content_block;
      if (block.type === 'tool_use') {
        state.accumulator.start(event.index, block.id, block.name);
        return [{ type: 'tool_use_start', toolUseId: block.id, toolName: block.name }];
      }
      return [];
    }

    case 'content_block_delta':
      return mapDelta(event, state);

    case 'content_block_stop': {
      const complete = state.accumulator.finish(event.index);
      if (!complete) return [];
      return [
        {
          type: 'tool_use_complete',
          toolUseId: complete.toolUseId,
          input: parseToolInput(complete.rawJson),
        },
      ];
    }

    case 'message_delta':
      return mapMessageDelta(event);

    case 'message_stop':
      return [];

    default: {
      const exhaustive: never = event;
      return exhaustive as readonly AgentEvent[];
    }
  }
}

function mapDelta(
  event: Extract<ClaudeStreamEvent, { type: 'content_block_delta' }>,
  state: EventMapperState,
): readonly AgentEvent[] {
  const delta = event.delta;
  if (delta.type === 'text_delta') return [{ type: 'text_delta', text: delta.text }];
  if (delta.type === 'thinking_delta') return [{ type: 'thinking_delta', text: delta.thinking }];
  if (delta.type === 'input_json_delta') {
    state.accumulator.appendDelta(event.index, delta.partial_json);
    const peek = state.accumulator.peek(event.index);
    if (!peek) return [];
    return [
      { type: 'tool_use_input_delta', toolUseId: peek.toolUseId, partial: delta.partial_json },
    ];
  }
  return [];
}

function mapMessageDelta(
  event: Extract<ClaudeStreamEvent, { type: 'message_delta' }>,
): readonly AgentEvent[] {
  const events: AgentEvent[] = [];
  if (event.usage) {
    events.push({
      type: 'usage',
      input: event.usage.input_tokens ?? 0,
      output: event.usage.output_tokens ?? 0,
      ...(event.usage.cache_read_input_tokens === undefined
        ? {}
        : { cacheRead: event.usage.cache_read_input_tokens }),
      ...(event.usage.cache_creation_input_tokens === undefined
        ? {}
        : { cacheWrite: event.usage.cache_creation_input_tokens }),
    });
  }
  if (event.delta.stop_reason) {
    events.push({ type: 'done', reason: mapStopReason(event.delta.stop_reason) });
  }
  return events;
}
