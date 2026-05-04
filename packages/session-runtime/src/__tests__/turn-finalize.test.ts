/**
 * Testes unitários para `finalizeAssistantMessage` (turn-finalize.ts).
 *
 * Coberturas obrigatórias CR-46 F-CR46-1:
 *  - content.length === 0 short-circuit: retorna ok sem chamar append
 *  - texto não-vazio: chama append com role:assistant e content correto
 *  - thinking + texto: ambos em content
 *  - apenas thinking sem texto: chama append
 *  - append retorna err: propaga o erro
 *  - thinkingLevel propagado em metadata quando fornecido
 */

import { AppError, ErrorCode } from '@g4os/kernel/errors';
import type { Message, MessageAppendResult } from '@g4os/kernel/types';
import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { SessionEventBus } from '../session-event-bus.ts';
import { finalizeAssistantMessage } from '../turn-finalize.ts';

const SESSION_ID = '00000000-0000-0000-0000-00000000sess';
const TURN_ID = 'turn-final-001';

function makeMessage(): Message {
  return {
    id: 'msg-1',
    sessionId: SESSION_ID,
    role: 'assistant',
    content: [{ type: 'text', text: 'ok' }],
    attachments: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    metadata: {},
  } as unknown as Message;
}

function makeAppendResult(): MessageAppendResult {
  return { message: makeMessage(), sequenceNumber: 7 };
}

function makeMessages(appendResult: MessageAppendResult | 'err' = makeAppendResult()) {
  return {
    append: vi
      .fn()
      .mockResolvedValue(
        appendResult === 'err'
          ? err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'append failed' }))
          : ok(appendResult),
      ),
    list: vi.fn().mockResolvedValue(ok([])),
  };
}

describe('finalizeAssistantMessage', () => {
  it('F-CR46-1: content.length === 0 retorna ok sem chamar append', async () => {
    const messages = makeMessages();
    const bus = new SessionEventBus();
    const result = await finalizeAssistantMessage(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        textChunks: [],
        thinkingChunks: [],
        usageInput: 0,
        usageOutput: 0,
        modelId: 'claude-test',
      },
    );
    expect(result.isOk()).toBe(true);
    expect(messages.append).not.toHaveBeenCalled();
    bus.dispose();
  });

  it('texto não-vazio: chama append com role:assistant', async () => {
    const messages = makeMessages();
    const bus = new SessionEventBus();
    const result = await finalizeAssistantMessage(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        textChunks: ['hello', ' world'],
        thinkingChunks: [],
        usageInput: 5,
        usageOutput: 3,
        modelId: 'claude-test',
      },
    );
    expect(result.isOk()).toBe(true);
    expect(messages.append).toHaveBeenCalledOnce();
    const callArg = (messages.append as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(callArg?.role).toBe('assistant');
    expect(callArg?.content).toEqual([{ type: 'text', text: 'hello world' }]);
    bus.dispose();
  });

  it('thinking + texto: ambos aparecem em content na ordem correta', async () => {
    const messages = makeMessages();
    const bus = new SessionEventBus();
    await finalizeAssistantMessage(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        textChunks: ['answer'],
        thinkingChunks: ['thinking...'],
        usageInput: 10,
        usageOutput: 5,
        modelId: 'claude-test',
      },
    );
    const content = (messages.append as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.content;
    expect(content?.[0]?.type).toBe('thinking');
    expect(content?.[1]?.type).toBe('text');
    bus.dispose();
  });

  it('apenas thinking sem texto: chama append (thinking é conteúdo válido)', async () => {
    const messages = makeMessages();
    const bus = new SessionEventBus();
    const result = await finalizeAssistantMessage(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        textChunks: [],
        thinkingChunks: ['thinking only'],
        usageInput: 3,
        usageOutput: 1,
        modelId: 'claude-test',
      },
    );
    expect(result.isOk()).toBe(true);
    expect(messages.append).toHaveBeenCalledOnce();
    bus.dispose();
  });

  it('append retorna err: propaga o erro', async () => {
    const messages = makeMessages('err');
    const bus = new SessionEventBus();
    const result = await finalizeAssistantMessage(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        textChunks: ['text'],
        thinkingChunks: [],
        usageInput: 1,
        usageOutput: 1,
        modelId: 'claude-test',
      },
    );
    expect(result.isErr()).toBe(true);
    bus.dispose();
  });

  it('thinkingLevel propagado em metadata quando fornecido', async () => {
    const messages = makeMessages();
    const bus = new SessionEventBus();
    await finalizeAssistantMessage(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        textChunks: ['ok'],
        thinkingChunks: [],
        usageInput: 1,
        usageOutput: 1,
        modelId: 'claude-test',
        thinkingLevel: 'medium',
      },
    );
    const metadata = (messages.append as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.metadata;
    expect(metadata?.thinkingLevel).toBe('medium');
    bus.dispose();
  });

  it('emite message.added no bus quando append é bem-sucedido', async () => {
    const bus = new SessionEventBus();
    const received: string[] = [];
    bus.subscribe(SESSION_ID, (e) => {
      if (e.type === 'message.added') received.push(e.type);
    });
    const messages = makeMessages();
    await finalizeAssistantMessage(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        turnId: TURN_ID,
        textChunks: ['msg'],
        thinkingChunks: [],
        usageInput: 1,
        usageOutput: 1,
        modelId: 'claude-test',
      },
    );
    expect(received).toHaveLength(1);
    bus.dispose();
  });
});
