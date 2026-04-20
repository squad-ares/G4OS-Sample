import type { Message } from '@g4os/kernel';
import { describe, expect, it } from 'vitest';
import {
  buildGeminiStreamParams,
  mapMessagesToGemini,
  mapToolsToGemini,
} from '../../google/config/mapper.ts';

const FAKE_SESSION_ID = '00000000-0000-0000-0000-000000000001' as const;

function makeMsg(role: 'user' | 'assistant' | 'tool', content: Message['content']): Message {
  return {
    id: '00000000-0000-0000-0000-000000000002',
    sessionId: FAKE_SESSION_ID,
    role,
    content,
    attachments: [],
    createdAt: 1000,
    updatedAt: 1000,
    metadata: {},
  };
}

describe('google/config/mapper', () => {
  describe('mapMessagesToGemini', () => {
    it('maps user text messages correctly', () => {
      const messages = [makeMsg('user', [{ type: 'text', text: 'Hello Gemini!' }])];
      const result = mapMessagesToGemini(messages);

      expect(result).toHaveLength(1);
      expect(result[0]?.role).toBe('user');
      expect(result[0]?.parts).toEqual([{ text: 'Hello Gemini!' }]);
    });

    it('maps assistant text messages correctly', () => {
      const messages = [makeMsg('assistant', [{ type: 'text', text: 'I am here.' }])];
      const result = mapMessagesToGemini(messages);

      expect(result).toHaveLength(1);
      expect(result[0]?.role).toBe('model');
      expect(result[0]?.parts).toEqual([{ text: 'I am here.' }]);
    });

    it('maps assistant thinking blocks as omitted text', () => {
      const messages = [
        makeMsg('assistant', [
          { type: 'thinking', text: 'Hmm...' },
          { type: 'text', text: 'Yes.' },
        ]),
      ];
      const result = mapMessagesToGemini(messages);

      expect(result[0]?.parts).toContainEqual({ text: '[Reasoning omitted]\nHmm...' });
      expect(result[0]?.parts).toContainEqual({ text: 'Yes.' });
    });

    it('maps tool uses into functionCall parts', () => {
      const messages = [
        makeMsg('assistant', [
          { type: 'tool_use', toolUseId: 'tu1', toolName: 'bash', input: { cmd: 'ls' } },
        ]),
      ];
      const result = mapMessagesToGemini(messages);

      expect(result[0]?.parts).toEqual([
        { functionCall: { name: 'g4_bash', args: { cmd: 'ls' } } },
      ]);
    });

    it('maps tool results into role=user functionResponse', () => {
      const msg = makeMsg('tool', [
        { type: 'tool_result', toolUseId: 'tu1', content: 'bin', isError: false },
      ]);
      // Patching toolName like mapper does temporarily
      (msg as unknown as { toolName: string }).toolName = 'bash';

      const result = mapMessagesToGemini([msg]);

      expect(result[0]?.role).toBe('user');
      expect(result[0]?.parts).toEqual([
        { functionResponse: { name: 'g4_bash', response: { result: 'bin' } } },
      ]);
    });
  });

  describe('mapToolsToGemini', () => {
    it('returns empty array when no tools', () => {
      expect(mapToolsToGemini([])).toEqual([]);
    });

    it('maps tools to functionDeclarations array inside a single tool block', () => {
      const tools = [{ name: 'myTool', description: 'desc', inputSchema: {} }];
      const result = mapToolsToGemini(tools);

      expect(result).toHaveLength(1);
      expect(result[0]?.functionDeclarations).toHaveLength(1);
      expect(result[0]?.functionDeclarations?.[0]?.name).toBe('g4_myTool');
    });
  });

  describe('buildGeminiStreamParams', () => {
    it('strips pi/ prefix from model name', () => {
      const config = { connectionSlug: 'g', modelId: 'pi/gemini-2.5-pro' };
      const params = buildGeminiStreamParams(config, []);
      expect(params.model).toBe('gemini-2.5-pro');
    });

    it('includes systemInstruction when present', () => {
      const config = { connectionSlug: 'g', modelId: 'gemini', systemPrompt: 'Sys prompt' };
      const params = buildGeminiStreamParams(config, []);
      expect(params.systemInstruction).toBe('Sys prompt');
    });
  });
});
