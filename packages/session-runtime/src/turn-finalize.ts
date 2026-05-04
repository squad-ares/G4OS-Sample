import type { ThinkingLevel } from '@g4os/agents/interface';
import type { MessagesService } from '@g4os/ipc/server';
import type { AppError } from '@g4os/kernel/errors';
import type { ContentBlock, Message, SessionId } from '@g4os/kernel/types';
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
  /** CR-25 F-CR25-1: opcional. Quando presente, persiste em metadata. */
  readonly thinkingLevel?: ThinkingLevel;
  /** CR-25 F-CR25-1: opcional. Wallclock do turn para post-mortem. */
  readonly durationMs?: number;
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

  // CR-25 F-CR25-1: metadata server-trusted. Antes era discardada — provenance
  // (modelId), usage (tokens) e contexto de thinking sumiam do JSONL, e o
  // reducer escrevia `tokenCount: 0` no `messages_index`. Agora preserva.
  const metadata: Pick<
    NonNullable<Message['metadata']>,
    'modelId' | 'usage' | 'thinkingLevel' | 'durationMs'
  > = {
    modelId: input.modelId,
    usage: { inputTokens: input.usageInput, outputTokens: input.usageOutput },
    ...(input.thinkingLevel === undefined ? {} : { thinkingLevel: input.thinkingLevel }),
    ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
  };

  const append = await deps.messages.append({
    sessionId: input.sessionId,
    role: 'assistant',
    content,
    metadata,
  });
  if (append.isErr()) return err(append.error);

  deps.eventBus.emit(input.sessionId, buildMessageAddedEvent(append.value));
  return ok(undefined);
}
