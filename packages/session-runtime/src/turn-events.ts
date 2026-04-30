import { randomUUID } from 'node:crypto';
import type { AgentEvent } from '@g4os/agents/interface';
import type { MessageAppendResult, SessionEvent, SessionId } from '@g4os/kernel/types';
import type { SessionEventBus } from './session-event-bus.ts';

export interface TurnAccumulator {
  readonly onText: (chunk: string) => void;
  readonly onThinking: (chunk: string) => void;
  readonly onUsage: (usage: { input: number; output: number }) => void;
}

export interface TurnEventCtx {
  readonly sessionId: SessionId;
  readonly turnId: string;
  readonly bus: SessionEventBus;
  readonly accumulator: TurnAccumulator;
}

export function forwardAgentEvent(event: AgentEvent, ctx: TurnEventCtx): void {
  switch (event.type) {
    case 'text_delta': {
      ctx.accumulator.onText(event.text);
      ctx.bus.emit(ctx.sessionId, {
        type: 'turn.text_chunk',
        sessionId: ctx.sessionId,
        turnId: ctx.turnId,
        text: event.text,
      });
      break;
    }
    case 'thinking_delta': {
      ctx.accumulator.onThinking(event.text);
      ctx.bus.emit(ctx.sessionId, {
        type: 'turn.thinking_chunk',
        sessionId: ctx.sessionId,
        turnId: ctx.turnId,
        text: event.text,
      });
      break;
    }
    case 'usage': {
      ctx.accumulator.onUsage({ input: event.input, output: event.output });
      break;
    }
    case 'done': {
      ctx.bus.emit(ctx.sessionId, {
        type: 'turn.done',
        sessionId: ctx.sessionId,
        turnId: ctx.turnId,
        reason: event.reason,
      });
      break;
    }
    case 'error': {
      ctx.bus.emit(ctx.sessionId, {
        type: 'turn.error',
        sessionId: ctx.sessionId,
        turnId: ctx.turnId,
        code: event.error.code,
        message: event.error.message,
      });
      break;
    }
    default:
      // tool_use_* handled by the TurnDispatcher tool loop
      break;
  }
}

export function buildMessageAddedEvent(appended: MessageAppendResult): SessionEvent {
  return {
    eventId: randomUUID(),
    sessionId: appended.message.sessionId,
    sequenceNumber: appended.sequenceNumber,
    timestamp: appended.message.createdAt,
    type: 'message.added',
    message: appended.message,
  };
}
