import type { Message } from '@g4os/kernel';
import { describe, expect, it } from 'vitest';
import {
  buildGeminiStreamParams,
  mapMessagesToGemini,
  mapToolsToGemini,
} from '../../google/config/mapper.ts';
import { toGeminiSafeToolName, toGeminiSafeToolNameUnique } from '../../google/types.ts';

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
  describe('toGeminiSafeToolName (stateless, for history)', () => {
    it('produces g4_<base>_<hash> format', () => {
      const name = toGeminiSafeToolName('read_file');
      expect(name).toMatch(/^g4_read_file_[a-z0-9]{1,8}$/);
    });

    it('is idempotent — same input always same output', () => {
      const a = toGeminiSafeToolName('bash');
      const b = toGeminiSafeToolName('bash');
      expect(a).toBe(b);
    });

    it('stays within 64 chars for long names', () => {
      const longName = 'a'.repeat(200);
      expect(toGeminiSafeToolName(longName).length).toBeLessThanOrEqual(64);
    });

    it('sanitizes non-Gemini chars', () => {
      const name = toGeminiSafeToolName('mcp__github__create_pr');
      expect(name).toMatch(/^g4_/);
      expect(name).toMatch(/^[A-Za-z0-9g4_.]+$/);
    });
  });

  describe('toGeminiSafeToolNameUnique (with collision detection)', () => {
    it('returns base name on first call', () => {
      const usedNames = new Set<string>();
      const name = toGeminiSafeToolNameUnique('myTool', usedNames);
      expect(name).toBe(toGeminiSafeToolName('myTool'));
    });

    it('adds suffix on collision', () => {
      const usedNames = new Set<string>();
      const first = toGeminiSafeToolNameUnique('myTool', usedNames);
      const second = toGeminiSafeToolNameUnique('myTool', usedNames);
      expect(first).not.toBe(second);
      expect(second).toMatch(/^g4_/);
    });

    it('adds candidate to usedNames Set', () => {
      const usedNames = new Set<string>();
      const name = toGeminiSafeToolNameUnique('bash', usedNames);
      expect(usedNames.has(name)).toBe(true);
    });
  });

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

    it('maps tool uses into functionCall parts with FNV-1a safe name', () => {
      const messages = [
        makeMsg('assistant', [
          { type: 'tool_use', toolUseId: 'tu1', toolName: 'bash', input: { cmd: 'ls' } },
        ]),
      ];
      const result = mapMessagesToGemini(messages);
      const expectedName = toGeminiSafeToolName('bash');

      expect(result[0]?.parts).toEqual([
        { functionCall: { name: expectedName, args: { cmd: 'ls' } } },
      ]);
    });

    it('maps tool results into role=user functionResponse with FNV-1a safe name', () => {
      const msg = makeMsg('tool', [
        { type: 'tool_result', toolUseId: 'tu1', content: 'bin', isError: false },
      ]);
      (msg as unknown as { toolName: string }).toolName = 'bash';

      const result = mapMessagesToGemini([msg]);
      const expectedName = toGeminiSafeToolName('bash');

      expect(result[0]?.role).toBe('user');
      expect(result[0]?.parts).toEqual([
        { functionResponse: { name: expectedName, response: { result: 'bin' } } },
      ]);
    });
  });

  describe('mapToolsToGemini', () => {
    it('returns empty array when no tools', () => {
      expect(mapToolsToGemini([], new Set())).toEqual([]);
    });

    it('maps tools to functionDeclarations array inside a single tool block', () => {
      const usedNames = new Set<string>();
      const tools = [{ name: 'myTool', description: 'desc', inputSchema: {} }];
      const result = mapToolsToGemini(tools, usedNames);
      const expectedName = toGeminiSafeToolName('myTool');

      expect(result).toHaveLength(1);
      expect(result[0]?.functionDeclarations).toHaveLength(1);
      expect(result[0]?.functionDeclarations?.[0]?.name).toBe(expectedName);
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

    it('includes tools with FNV-1a safe names', () => {
      const config = {
        connectionSlug: 'g',
        modelId: 'gemini',
        tools: [{ name: 'read_file', description: 'Read', inputSchema: {} }],
      };
      const params = buildGeminiStreamParams(config, []);
      const decls = params.tools?.[0]?.functionDeclarations ?? [];
      expect(decls[0]?.name).toMatch(/^g4_read_file_/);
    });
  });
});
