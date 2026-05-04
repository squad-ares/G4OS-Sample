/**
 * Testes unitários para `persistAssistantToolTurn` e `persistToolResultMessage`
 * (tool-persist.ts).
 *
 * Coberturas obrigatórias CR-46 F-CR46-1:
 *  - `persistAssistantToolTurn` com content.length === 0 retorna err
 *    'empty assistant turn with tool_use'
 *  - `persistAssistantToolTurn` com tool_uses retorna ok com Message
 *  - `persistAssistantToolTurn` com texto buffered inclui text block
 *  - `persistAssistantToolTurn` propaga append error
 *  - `persistToolResultMessage` mapeia outcomes para tool_result blocks
 *  - `persistToolResultMessage` propaga append error
 */

import { AppError, ErrorCode } from '@g4os/kernel/errors';
import type { Message, MessageAppendResult } from '@g4os/kernel/types';
import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import { SessionEventBus } from '../session-event-bus.ts';
import type { ToolOutcome } from '../tool-execution.ts';
import { persistAssistantToolTurn, persistToolResultMessage } from '../tool-persist.ts';
import type { CapturedToolUse } from '../turn-runner.ts';

const SESSION_ID = '00000000-0000-0000-0000-00000000sess';

function makeMessage(id = 'msg-1'): Message {
  return {
    id,
    sessionId: SESSION_ID,
    role: 'assistant',
    content: [],
    attachments: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    metadata: {},
  } as unknown as Message;
}

function makeAppendResult(id = 'msg-1'): MessageAppendResult {
  return { message: makeMessage(id), sequenceNumber: 1 };
}

function makeMessages(appendResult: MessageAppendResult | 'err' = makeAppendResult()) {
  return {
    append: vi
      .fn()
      .mockResolvedValue(
        appendResult === 'err'
          ? err(new AppError({ code: ErrorCode.UNKNOWN_ERROR, message: 'append fail' }))
          : ok(appendResult),
      ),
    list: vi.fn().mockResolvedValue(ok([])),
  };
}

function makeToolUse(id = 'tu-1', name = 'read_file'): CapturedToolUse {
  return { toolUseId: id, toolName: name, input: { path: '/tmp/test.txt' } };
}

function makeOutcome(id = 'tu-1', isError = false): ToolOutcome {
  return {
    toolUseId: id,
    toolName: 'read_file',
    isError,
    content: isError ? 'error occurred' : 'file contents',
  };
}

describe('persistAssistantToolTurn', () => {
  it('F-CR46-1: content vazio (sem text, sem thinking, sem toolUses) retorna err', async () => {
    const bus = new SessionEventBus();
    const messages = makeMessages();
    const result = await persistAssistantToolTurn(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        textBuffered: '',
        thinkingBuffered: '',
        toolUses: [],
        modelId: 'claude-test',
      },
    );
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.message).toContain('empty assistant turn');
    expect(messages.append).not.toHaveBeenCalled();
    bus.dispose();
  });

  it('tool_uses sem texto: inclui apenas tool_use blocks no content', async () => {
    const bus = new SessionEventBus();
    const messages = makeMessages();
    const result = await persistAssistantToolTurn(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        textBuffered: '',
        thinkingBuffered: '',
        toolUses: [makeToolUse()],
        modelId: 'claude-test',
      },
    );
    expect(result.isOk()).toBe(true);
    const content = (messages.append as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.content;
    expect(content).toHaveLength(1);
    expect(content?.[0]?.type).toBe('tool_use');
    bus.dispose();
  });

  it('texto buffered + tool_uses: inclui text block + tool_use blocks', async () => {
    const bus = new SessionEventBus();
    const messages = makeMessages();
    await persistAssistantToolTurn(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        textBuffered: 'vou chamar a tool',
        thinkingBuffered: '',
        toolUses: [makeToolUse()],
        modelId: 'claude-test',
      },
    );
    const content = (messages.append as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.content;
    expect(content?.some((b: { type: string }) => b.type === 'text')).toBe(true);
    expect(content?.some((b: { type: string }) => b.type === 'tool_use')).toBe(true);
    bus.dispose();
  });

  it('thinking buffered inclui thinking block antes do texto', async () => {
    const bus = new SessionEventBus();
    const messages = makeMessages();
    await persistAssistantToolTurn(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        textBuffered: 'answer',
        thinkingBuffered: 'thinking...',
        toolUses: [],
        modelId: 'claude-test',
      },
    );
    const content = (messages.append as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.content;
    expect(content?.[0]?.type).toBe('thinking');
    expect(content?.[1]?.type).toBe('text');
    bus.dispose();
  });

  it('append retorna err: propaga o erro', async () => {
    const bus = new SessionEventBus();
    const messages = makeMessages('err');
    const result = await persistAssistantToolTurn(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        textBuffered: '',
        thinkingBuffered: '',
        toolUses: [makeToolUse()],
        modelId: 'claude-test',
      },
    );
    expect(result.isErr()).toBe(true);
    bus.dispose();
  });

  it('usage e thinkingLevel propagados em metadata', async () => {
    const bus = new SessionEventBus();
    const messages = makeMessages();
    await persistAssistantToolTurn(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        textBuffered: '',
        thinkingBuffered: '',
        toolUses: [makeToolUse()],
        modelId: 'claude-test',
        usageInput: 10,
        usageOutput: 5,
        thinkingLevel: 'high',
      },
    );
    const metadata = (messages.append as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.metadata;
    expect(metadata?.usage?.inputTokens).toBe(10);
    expect(metadata?.usage?.outputTokens).toBe(5);
    expect(metadata?.thinkingLevel).toBe('high');
    bus.dispose();
  });
});

describe('persistToolResultMessage', () => {
  it('mapeia outcomes para tool_result blocks com role:tool', async () => {
    const bus = new SessionEventBus();
    const messages = makeMessages();
    const result = await persistToolResultMessage(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        outcomes: [makeOutcome('tu-1', false), makeOutcome('tu-2', true)],
      },
    );
    expect(result.isOk()).toBe(true);
    const callArg = (messages.append as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(callArg?.role).toBe('tool');
    const content = callArg?.content as Array<{ type: string; isError: boolean }>;
    expect(content).toHaveLength(2);
    expect(content[0]?.type).toBe('tool_result');
    expect(content[0]?.isError).toBe(false);
    expect(content[1]?.isError).toBe(true);
    bus.dispose();
  });

  it('append retorna err: propaga o erro', async () => {
    const bus = new SessionEventBus();
    const messages = makeMessages('err');
    const result = await persistToolResultMessage(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        outcomes: [makeOutcome()],
      },
    );
    expect(result.isErr()).toBe(true);
    bus.dispose();
  });

  it('emite message.added no bus quando append é bem-sucedido', async () => {
    const bus = new SessionEventBus();
    const received: string[] = [];
    bus.subscribe(SESSION_ID, (e) => {
      if (e.type === 'message.added') received.push(e.type);
    });
    const messages = makeMessages();
    await persistToolResultMessage(
      { messages: messages as never, eventBus: bus },
      {
        sessionId: SESSION_ID,
        outcomes: [makeOutcome()],
      },
    );
    expect(received).toHaveLength(1);
    bus.dispose();
  });
});
