import { describe, expect, it } from 'vitest';
import { MessageSchema } from '../schemas/message.schema.ts';

describe('MessageSchema', () => {
  it('parses valid user message', () => {
    const msg = MessageSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      sessionId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      role: 'user',
      content: [{ type: 'text', text: 'Hello' }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(msg.role).toBe('user');
    expect(msg.attachments).toEqual([]);
  });

  it('rejects message with invalid role', () => {
    expect(() =>
      MessageSchema.parse({
        id: '550e8400-e29b-41d4-a716-446655440000',
        sessionId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        role: 'admin', // invalid
        content: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    ).toThrow();
  });

  it('validates tool_use content block structure', () => {
    const msg = MessageSchema.parse({
      id: '550e8400-e29b-41d4-a716-446655440000',
      sessionId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me check that' },
        {
          type: 'tool_use',
          toolUseId: 'tool-1',
          toolName: 'read_file',
          input: { path: '/tmp/x.txt' },
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    expect(msg.content).toHaveLength(2);
  });
});
