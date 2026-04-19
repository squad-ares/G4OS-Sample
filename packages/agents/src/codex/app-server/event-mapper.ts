import type { AgentDoneReason, AgentEvent } from '../../interface/agent.ts';
import type { CodexResponseEvent } from './protocol.ts';

export function mapCodexStopReason(
  reason: 'stop' | 'max_tokens' | 'tool_use' | 'interrupted' | 'error',
): AgentDoneReason {
  return reason;
}

export function mapCodexEvent(event: CodexResponseEvent): AgentEvent | undefined {
  switch (event.type) {
    case 'ack':
      return undefined;
    case 'turn_started':
      return { type: 'started', turnId: event.turnId };
    case 'text_delta':
      return { type: 'text_delta', text: event.text };
    case 'thinking_delta':
      return { type: 'thinking_delta', text: event.text };
    case 'tool_use_start':
      return {
        type: 'tool_use_start',
        toolUseId: event.toolUseId,
        toolName: event.toolName,
      };
    case 'tool_use_input_delta':
      return {
        type: 'tool_use_input_delta',
        toolUseId: event.toolUseId,
        partial: event.partial,
      };
    case 'tool_use_complete':
      return {
        type: 'tool_use_complete',
        toolUseId: event.toolUseId,
        input: event.input,
      };
    case 'usage':
      return {
        type: 'usage',
        input: event.inputTokens,
        output: event.outputTokens,
        ...(event.cacheReadTokens === undefined ? {} : { cacheRead: event.cacheReadTokens }),
        ...(event.cacheWriteTokens === undefined ? {} : { cacheWrite: event.cacheWriteTokens }),
      };
    case 'turn_finished':
      return { type: 'done', reason: mapCodexStopReason(event.stopReason) };
    case 'error':
      return undefined;
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
