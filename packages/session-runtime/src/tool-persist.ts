/**
 * Persistência das mensagens do assistente + role=tool durante uma iteração
 * de tool-use. Isolado pra manter `tool-loop.ts` abaixo do cap de 300 LOC.
 */

import type { MessagesService } from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import type { ContentBlock, Message, SessionId } from '@g4os/kernel/types';
import { err, ok, type Result } from 'neverthrow';
import type { SessionEventBus } from './session-event-bus.ts';
import type { ToolOutcome } from './tool-execution.ts';
import { buildMessageAddedEvent } from './turn-events.ts';
import type { CapturedToolUse } from './turn-runner.ts';

export interface ToolPersistDeps {
  readonly messages: MessagesService;
  readonly eventBus: SessionEventBus;
}

export async function persistAssistantToolTurn(
  deps: ToolPersistDeps,
  input: {
    readonly sessionId: SessionId;
    readonly textBuffered: string;
    readonly thinkingBuffered: string;
    readonly toolUses: readonly CapturedToolUse[];
    readonly modelId: string;
  },
): Promise<Result<Message, AppError>> {
  const content: ContentBlock[] = [];
  if (input.thinkingBuffered.length > 0) {
    content.push({ type: 'thinking', text: input.thinkingBuffered });
  }
  if (input.textBuffered.length > 0) {
    content.push({ type: 'text', text: input.textBuffered });
  }
  for (const use of input.toolUses) {
    content.push({
      type: 'tool_use',
      toolUseId: use.toolUseId,
      toolName: use.toolName,
      input: { ...use.input },
    });
  }
  if (content.length === 0) {
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: 'empty assistant turn with tool_use',
        context: { sessionId: input.sessionId },
      }),
    );
  }
  const append = await deps.messages.append({
    sessionId: input.sessionId,
    role: 'assistant',
    content,
  });
  if (append.isErr()) return err(append.error);
  deps.eventBus.emit(input.sessionId, buildMessageAddedEvent(append.value, 0));
  return ok(append.value);
}

export async function persistToolResultMessage(
  deps: ToolPersistDeps,
  input: {
    readonly sessionId: SessionId;
    readonly outcomes: readonly ToolOutcome[];
  },
): Promise<Result<Message, AppError>> {
  const content: ContentBlock[] = input.outcomes.map((o) => ({
    type: 'tool_result',
    toolUseId: o.toolUseId,
    content: o.content,
    isError: o.isError,
  }));
  const append = await deps.messages.append({
    sessionId: input.sessionId,
    role: 'tool',
    content,
  });
  if (append.isErr()) return err(append.error);
  deps.eventBus.emit(input.sessionId, buildMessageAddedEvent(append.value, 0));
  return ok(append.value);
}
