import type { Message as KernelMessage } from '@g4os/kernel/types';
import { describe, expect, it } from 'vitest';
import { kernelMessageToChat } from '../kernel-to-chat-mapper.ts';

const BASE_ID = '11111111-2222-4333-8444-555555555555';
const SESSION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function makeKernelMsg(overrides: Partial<KernelMessage>): KernelMessage {
  return {
    id: BASE_ID,
    sessionId: SESSION_ID,
    role: 'assistant',
    content: [],
    attachments: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_001_000,
    metadata: {},
    ...overrides,
  };
}

describe('kernelMessageToChat', () => {
  it('passes through text blocks unchanged', () => {
    const msg = makeKernelMsg({ content: [{ type: 'text', text: 'hello' }] });
    const result = kernelMessageToChat(msg);
    expect(result.content[0]).toEqual({ type: 'text', text: 'hello' });
  });

  it('maps thinking.text to thinking.thinking', () => {
    const msg = makeKernelMsg({ content: [{ type: 'thinking', text: 'chain of thought' }] });
    const result = kernelMessageToChat(msg);
    expect(result.content[0]).toEqual({ type: 'thinking', thinking: 'chain of thought' });
  });

  it('maps tool_use.toolUseId→id and toolName→name', () => {
    const msg = makeKernelMsg({
      content: [
        {
          type: 'tool_use',
          toolUseId: 'tool-123',
          toolName: 'bash',
          input: { command: 'ls' },
        },
      ],
    });
    const result = kernelMessageToChat(msg);
    expect(result.content[0]).toEqual({
      type: 'tool_use',
      id: 'tool-123',
      name: 'bash',
      input: { command: 'ls' },
    });
  });

  it('passes through tool_result blocks', () => {
    const msg = makeKernelMsg({
      content: [
        {
          type: 'tool_result',
          toolUseId: 'tool-123',
          content: 'output text',
          isError: false,
        },
      ],
    });
    const result = kernelMessageToChat(msg);
    expect(result.content[0]).toEqual({
      type: 'tool_result',
      toolUseId: 'tool-123',
      content: 'output text',
      isError: false,
    });
  });

  it('maps role "tool" to "system"', () => {
    const msg = makeKernelMsg({ role: 'tool' });
    expect(kernelMessageToChat(msg).role).toBe('system');
  });

  it('passes through user and assistant roles', () => {
    expect(kernelMessageToChat(makeKernelMsg({ role: 'user' })).role).toBe('user');
    expect(kernelMessageToChat(makeKernelMsg({ role: 'assistant' })).role).toBe('assistant');
  });

  it('preserves id and createdAt', () => {
    const msg = makeKernelMsg({ id: BASE_ID, createdAt: 1_700_000_000_000 });
    const result = kernelMessageToChat(msg);
    expect(result.id).toBe(BASE_ID);
    expect(result.createdAt).toBe(1_700_000_000_000);
  });
});
