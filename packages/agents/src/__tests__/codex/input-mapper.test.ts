import type { Message } from '@g4os/kernel';
import { describe, expect, it } from 'vitest';
import { mapAgentInputToCodex } from '../../codex/app-server/input-mapper.ts';
import type { AgentTurnInput } from '../../interface/agent.ts';

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

function makeInput(overrides: Partial<AgentTurnInput> = {}): AgentTurnInput {
  return {
    sessionId: '22222222-2222-2222-2222-222222222222',
    turnId: 'turn-1',
    messages: [makeMessage({})],
    config: { connectionSlug: 'openai-codex', modelId: 'gpt-5-codex' },
    ...overrides,
  };
}

describe('mapAgentInputToCodex', () => {
  it('translates text + tool_use + tool_result blocks; drops thinking', () => {
    const input = makeInput({
      messages: [
        makeMessage({ role: 'user', content: [{ type: 'text', text: 'hello' }] }),
        makeMessage({
          role: 'assistant',
          content: [
            { type: 'thinking', text: 'silenced' },
            { type: 'text', text: 'calling' },
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
          content: [
            {
              type: 'tool_result',
              toolUseId: 'tu-1',
              content: [{ type: 'text', text: 'match' }],
              isError: false,
            },
          ],
        }),
      ],
    });
    const wire = mapAgentInputToCodex(input);
    expect(wire.messages).toHaveLength(3);
    expect(wire.messages[1]?.content).toHaveLength(2); // thinking dropped
    expect(wire.messages[1]?.content[0]).toMatchObject({ type: 'text', text: 'calling' });
    expect(wire.messages[1]?.content[1]).toMatchObject({
      type: 'tool_use',
      toolUseId: 'tu-1',
      name: 'grep',
    });
    expect(wire.messages[2]?.content[0]).toMatchObject({
      type: 'tool_result',
      toolUseId: 'tu-1',
      content: 'match',
      isError: false,
    });
  });

  it('passes tools + thinking level + instructions when present', () => {
    const wire = mapAgentInputToCodex(
      makeInput({
        config: {
          connectionSlug: 'openai-codex',
          modelId: 'gpt-5-codex',
          systemPrompt: 'you are G4',
          thinkingLevel: 'high',
          tools: [{ name: 'echo', description: 'echo back', inputSchema: { type: 'object' } }],
        },
      }),
    );
    expect(wire.instructions).toBe('you are G4');
    expect(wire.thinkingLevel).toBe('medium');
    expect(wire.tools).toHaveLength(1);
    expect(wire.tools?.[0]?.name).toBe('echo');
  });

  it('omits optional fields when absent', () => {
    const wire = mapAgentInputToCodex(makeInput());
    expect(wire.instructions).toBeUndefined();
    expect(wire.tools).toBeUndefined();
    expect(wire.thinkingLevel).toBeUndefined();
    expect(wire.model).toBe('gpt-5-codex');
  });

  it('maps ThinkingLevel enum onto Codex level strings', () => {
    for (const [agent, codex] of [
      ['low', 'low'],
      ['think', 'low'],
      ['high', 'medium'],
      ['ultra', 'high'],
    ] as const) {
      const wire = mapAgentInputToCodex(
        makeInput({
          config: {
            connectionSlug: 'openai-codex',
            modelId: 'x',
            thinkingLevel: agent,
          },
        }),
      );
      expect(wire.thinkingLevel).toBe(codex);
    }
  });
});
