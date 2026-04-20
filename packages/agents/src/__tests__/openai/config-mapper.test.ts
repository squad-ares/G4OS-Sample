import type { Message } from '@g4os/kernel';
import { describe, expect, it } from 'vitest';
import { mapConfig } from '../../openai/config/mapper.ts';

const BASE_CONFIG = {
  connectionSlug: 'openai',
  modelId: 'gpt-4o',
  systemPrompt: 'You are helpful.',
};

function makeMsg(role: 'user' | 'assistant' | 'tool', content: Message['content']): Message {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    sessionId: '00000000-0000-0000-0000-000000000002',
    role,
    content,
    attachments: [],
    createdAt: 1000,
    updatedAt: 1000,
    metadata: {},
  };
}

describe('openai/config/mapper', () => {
  describe('system prompt', () => {
    it('prepends system message when systemPrompt is set', () => {
      const result = mapConfig(BASE_CONFIG, []);
      expect(result.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    });

    it('omits system message when systemPrompt is undefined', () => {
      const result = mapConfig({ connectionSlug: 'openai', modelId: 'gpt-4o' }, []);
      expect(result.messages).toHaveLength(0);
    });
  });

  describe('user message mapping', () => {
    it('maps plain text user message', () => {
      const msg = makeMsg('user', [{ type: 'text', text: 'Hello!' }]);
      const result = mapConfig(BASE_CONFIG, [msg]);
      const last = result.messages[result.messages.length - 1];
      expect(last).toEqual({ role: 'user', content: 'Hello!' });
    });

    it('skips tool_use and tool_result blocks from user messages', () => {
      const msg = makeMsg('user', [
        { type: 'text', text: 'Run this' },
        { type: 'tool_use', toolUseId: 'tu1', toolName: 'bash', input: {} },
      ]);
      const result = mapConfig(BASE_CONFIG, [msg]);
      const last = result.messages[result.messages.length - 1];
      expect(last?.role).toBe('user');
      expect(last?.content).toBe('Run this');
    });
  });

  describe('assistant message mapping', () => {
    it('maps assistant text-only message', () => {
      const msg = makeMsg('assistant', [{ type: 'text', text: 'Here is the answer.' }]);
      const result = mapConfig(BASE_CONFIG, [msg]);
      const last = result.messages[result.messages.length - 1];
      expect(last).toEqual({ role: 'assistant', content: 'Here is the answer.' });
    });

    it('maps assistant message with tool_use blocks to tool_calls', () => {
      const msg = makeMsg('assistant', [
        {
          type: 'tool_use',
          toolUseId: 'call_abc',
          toolName: 'read_file',
          input: { path: '/tmp/x' },
        },
      ]);
      const result = mapConfig(BASE_CONFIG, [msg]);
      const last = result.messages[result.messages.length - 1];
      expect(last?.role).toBe('assistant');
      expect(last?.content).toBeNull();
      expect(last?.tool_calls).toHaveLength(1);
      expect(last?.tool_calls?.[0]).toMatchObject({
        id: 'call_abc',
        type: 'function',
        function: { name: 'read_file' },
      });
      expect(JSON.parse(last?.tool_calls?.[0]?.function.arguments ?? '{}')).toEqual({
        path: '/tmp/x',
      });
    });

    it('includes text alongside tool_calls when both present', () => {
      const msg = makeMsg('assistant', [
        { type: 'text', text: 'Let me check that.' },
        { type: 'tool_use', toolUseId: 'call_xyz', toolName: 'bash', input: { cmd: 'ls' } },
      ]);
      const result = mapConfig(BASE_CONFIG, [msg]);
      const last = result.messages[result.messages.length - 1];
      expect(last?.content).toBe('Let me check that.');
      expect(last?.tool_calls).toHaveLength(1);
    });

    it('skips thinking blocks (no OpenAI equivalent)', () => {
      const msg = makeMsg('assistant', [
        { type: 'thinking', text: 'internal reasoning...' },
        { type: 'text', text: 'Answer.' },
      ]);
      const result = mapConfig(BASE_CONFIG, [msg]);
      const last = result.messages[result.messages.length - 1];
      expect(last?.content).toBe('Answer.');
      expect(last?.tool_calls).toBeUndefined();
    });
  });

  describe('tool message mapping (multi-turn)', () => {
    it('maps tool message to role:tool with tool_call_id', () => {
      const msg = makeMsg('tool', [
        {
          type: 'tool_result',
          toolUseId: 'call_abc',
          content: 'file contents here',
          isError: false,
        },
      ]);
      const result = mapConfig(BASE_CONFIG, [msg]);
      const last = result.messages[result.messages.length - 1];
      expect(last?.role).toBe('tool');
      expect(last?.tool_call_id).toBe('call_abc');
      expect(last?.content).toBe('file contents here');
    });

    it('maps tool result with text block array content', () => {
      const msg = makeMsg('tool', [
        {
          type: 'tool_result',
          toolUseId: 'call_xyz',
          content: [
            { type: 'text', text: 'block1' },
            { type: 'text', text: 'block2' },
          ],
          isError: false,
        },
      ]);
      const result = mapConfig(BASE_CONFIG, [msg]);
      const last = result.messages[result.messages.length - 1];
      expect(last?.content).toBe('block1block2');
    });
  });

  describe('multi-turn sequence', () => {
    it('produces correct user→assistant(tool_calls)→tool sequence', () => {
      const messages: Message[] = [
        makeMsg('user', [{ type: 'text', text: 'list files' }]),
        makeMsg('assistant', [
          { type: 'tool_use', toolUseId: 'c1', toolName: 'ls', input: { path: '/' } },
        ]),
        makeMsg('tool', [
          { type: 'tool_result', toolUseId: 'c1', content: 'bin etc usr', isError: false },
        ]),
      ];
      const result = mapConfig(BASE_CONFIG, messages);
      const [sys, user, assistant, tool] = result.messages;
      expect(sys?.role).toBe('system');
      expect(user?.role).toBe('user');
      expect(assistant?.role).toBe('assistant');
      expect(assistant?.tool_calls?.[0]?.id).toBe('c1');
      expect(tool?.role).toBe('tool');
      expect(tool?.tool_call_id).toBe('c1');
      expect(tool?.content).toBe('bin etc usr');
    });
  });

  describe('thinking level mapping', () => {
    it('adds reasoning_effort for o3 models', () => {
      const result = mapConfig(
        { connectionSlug: 'openai', modelId: 'o3-mini', thinkingLevel: 'high' },
        [],
      );
      expect(result.reasoning_effort).toBe('high');
    });

    it('omits reasoning_effort for gpt-4o models', () => {
      const result = mapConfig(
        { connectionSlug: 'openai', modelId: 'gpt-4o', thinkingLevel: 'think' },
        [],
      );
      expect(result.reasoning_effort).toBeUndefined();
    });
  });

  describe('optional fields', () => {
    it('includes max_tokens and temperature when provided', () => {
      const result = mapConfig({ ...BASE_CONFIG, maxTokens: 1000, temperature: 0.5 }, []);
      expect(result.max_tokens).toBe(1000);
      expect(result.temperature).toBe(0.5);
    });

    it('includes tools when provided', () => {
      const result = mapConfig(
        {
          ...BASE_CONFIG,
          tools: [{ name: 'bash', description: 'runs bash', inputSchema: {} }],
        },
        [],
      );
      expect(result.tools).toHaveLength(1);
      expect(result.tools?.[0]?.function.name).toBe('bash');
    });
  });
});
