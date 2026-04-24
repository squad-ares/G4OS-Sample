import type { MessagesService } from '@g4os/ipc/server';
import type { AppError } from '@g4os/kernel/errors';
import type { ContentBlock, SessionId } from '@g4os/kernel/types';
import { err, ok, type Result } from 'neverthrow';
import type { SessionEventBus } from './session-event-bus.ts';
import { buildMessageAddedEvent } from './turn-events.ts';

export interface FinalizeAssistantMessageInput {
  readonly sessionId: SessionId;
  readonly turnId: string;
  readonly textChunks: readonly string[];
  readonly thinkingChunks: readonly string[];
  readonly usageInput: number;
  readonly usageOutput: number;
  readonly modelId: string;
}

export async function finalizeAssistantMessage(
  deps: {
    readonly messages: MessagesService;
    readonly eventBus: SessionEventBus;
  },
  input: FinalizeAssistantMessageInput,
): Promise<Result<void, AppError>> {
  const content: ContentBlock[] = [];
  if (input.thinkingChunks.length > 0) {
    content.push({ type: 'thinking', text: input.thinkingChunks.join('') });
  }
  const text = input.textChunks.join('');
  if (text.length > 0) content.push({ type: 'text', text });
  if (content.length === 0) return ok(undefined);

  const append = await deps.messages.append({
    sessionId: input.sessionId,
    role: 'assistant',
    content,
  });
  if (append.isErr()) return err(append.error);

  deps.eventBus.emit(input.sessionId, buildMessageAddedEvent(append.value));
  return ok(undefined);
}
