import type { Message } from '@g4os/kernel';
import { describe, expect, it } from 'vitest';
import { mapConfig, mapMessages, mapThinking, mapTools } from '../../claude/config/mapper.ts';
import type { AgentConfig } from '../../interface/agent.ts';

function makeMessage(partial: Partial<Message>): Message {
  const now = Date.now();
  return {
    id: '11111111-1111-1111-1111-111111111111',
    sessionId: '22222222-2222-2222-2222-222222222222',
    role: 'user',
    content: [{ type: 'text', text: 'hi' }],
    attachments: [],
    createdAt: now,
    updatedAt: now,
    metadata: {},
    ...partial,
  };
}

describe('mapThinking', () => {
  it('prefers explicit budget override over level', () => {
    expect(mapThinking('think', 9_999)).toEqual({ type: 'enabled', budget_tokens: 9_999 });
  });
  it('maps each ThinkingLevel to the expected budget', () => {
    expect(mapThinking('low', undefined)).toMatchObject({ budget_tokens: 2_000 });
    expect(mapThinking('think', undefined)).toMatchObject({ budget_tokens: 5_000 });
    expect(mapThinking('high', undefined)).toMatchObject({ budget_tokens: 12_000 });
    expect(mapThinking('ultra', undefined)).toMatchObject({ budget_tokens: 32_000 });
  });
  it('returns undefined when level is absent', () => {
    expect(mapThinking(undefined, undefined)).toBeUndefined();
  });
});

describe('mapMessages', () => {
  it('translates text + tool_use + tool_result + thinking blocks', () => {
    const messages: Message[] = [
      makeMessage({ role: 'user', content: [{ type: 'text', text: 'hello' }] }),
      makeMessage({
        role: 'assistant',
        content: [
          { type: 'thinking', text: 'let me think' },
          { type: 'text', text: 'calling tool' },
          {
            type: 'tool_use',
            toolUseId: 'tu-1',
            toolName: 'grep',
            input: { q: 'foo' },
          },
        ],
      }),
      makeMessage({
        role: 'tool',
        content: [{ type: 'tool_result', toolUseId: 'tu-1', content: 'match', isError: false }],
      }),
    ];
    const out = mapMessages(messages);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ role: 'user', content: [{ type: 'text', text: 'hello' }] });
    expect(out[1]?.role).toBe('assistant');
    expect(out[1]?.content[0]).toMatchObject({ type: 'thinking', thinking: 'let me think' });
    expect(out[1]?.content[2]).toMatchObject({ type: 'tool_use', id: 'tu-1', name: 'grep' });
    expect(out[2]?.role).toBe('user');
    expect(out[2]?.content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'tu-1',
      is_error: false,
    });
  });

  it('drops system role + empty-content messages', () => {
    const messages: Message[] = [
      makeMessage({ role: 'system', content: [{ type: 'text', text: 'rules' }] }),
      makeMessage({ role: 'user', content: [] }),
    ];
    expect(mapMessages(messages)).toEqual([]);
  });
});

describe('mapTools', () => {
  it('maps kernel ToolDefinition to Claude tool params', () => {
    const config: AgentConfig = {
      connectionSlug: 'anthropic-direct',
      modelId: 'claude-opus-4-7',
      tools: [
        {
          name: 'grep',
          description: 'search files',
          inputSchema: { type: 'object' },
        },
      ],
    };
    const tools = mapTools(config);
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe('grep');
    expect(tools[0]?.input_schema).toEqual({ type: 'object' });
  });
  it('returns empty when no tools declared', () => {
    expect(mapTools({ connectionSlug: 'anthropic-direct', modelId: 'x' })).toEqual([]);
  });
});

describe('mapConfig', () => {
  it('builds a stream request with system prompt, tools, thinking and temperature', () => {
    const config: AgentConfig = {
      connectionSlug: 'anthropic-direct',
      modelId: 'claude-opus-4-7',
      maxTokens: 2048,
      temperature: 0.5,
      systemPrompt: 'you are G4',
      thinkingLevel: 'high',
      tools: [{ name: 'echo', description: 'echo', inputSchema: {} }],
    };
    const messages: Message[] = [makeMessage({})];
    const params = mapConfig(config, messages);
    expect(params.model).toBe('claude-opus-4-7');
    expect(params.max_tokens).toBe(2048);
    expect(params.stream).toBe(true);
    expect(params.system?.[0]?.text).toBe('you are G4');
    expect(params.tools?.[0]?.name).toBe('echo');
    expect(params.thinking).toEqual({ type: 'enabled', budget_tokens: 12_000 });
    expect(params.temperature).toBe(0.5);
  });

  it('omits optional fields when absent (no undefined leaks)', () => {
    const config: AgentConfig = { connectionSlug: 'anthropic-direct', modelId: 'claude-opus-4-7' };
    const params = mapConfig(config, []);
    expect(params.system).toBeUndefined();
    expect(params.tools).toBeUndefined();
    expect(params.thinking).toBeUndefined();
    expect(params.temperature).toBeUndefined();
    expect(params.max_tokens).toBe(4096);
  });
});
