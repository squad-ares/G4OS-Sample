import type { Message, MessageAppendResult } from '@g4os/kernel/types';
import { describe, expect, it } from 'vitest';
import { buildMessageAddedEvent } from '../turn-events.ts';

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    sessionId: '00000000-0000-0000-0000-00000000aaaa',
    role: 'assistant',
    content: [{ type: 'text', text: 'hello' }],
    attachments: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    metadata: {},
    ...overrides,
  };
}

describe('buildMessageAddedEvent (FOLLOWUP-04)', () => {
  it('builds a message.added event carrying the real sequence from MessageAppendResult', () => {
    const message = makeMessage();
    const appended: MessageAppendResult = { message, sequenceNumber: 7 };
    const event = buildMessageAddedEvent(appended);
    expect(event.type).toBe('message.added');
    expect(event.sequenceNumber).toBe(7);
    expect(event.sessionId).toBe(message.sessionId);
    expect(event.timestamp).toBe(message.createdAt);
    if (event.type === 'message.added') {
      expect(event.message).toBe(message);
    }
  });

  it('generates a unique eventId for each call', () => {
    const m = makeMessage();
    const a = buildMessageAddedEvent({ message: m, sequenceNumber: 1 });
    const b = buildMessageAddedEvent({ message: m, sequenceNumber: 2 });
    expect(a.eventId).not.toBe(b.eventId);
  });
});
