import { describe, expect, it } from 'vitest';
import {
  applyPromptCache,
  applyPromptCache1hTtl,
  upgradeExistingMarkers,
} from '../../claude/prompt-cache/cache-markers.ts';
import type { ClaudeCreateMessageParams } from '../../claude/types.ts';

function makeRequest(partial: Partial<ClaudeCreateMessageParams> = {}): ClaudeCreateMessageParams {
  return {
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    stream: true,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    ...partial,
  };
}

describe('applyPromptCache1hTtl', () => {
  it('marks the last system block with TTL 1h', () => {
    const request = makeRequest({
      system: [
        { type: 'text', text: 'a' },
        { type: 'text', text: 'b' },
      ],
    });
    const result = applyPromptCache1hTtl(request);
    expect(result.system?.[0]?.cache_control).toBeUndefined();
    expect(result.system?.[1]?.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  it('marks the last tool with TTL 1h', () => {
    const request = makeRequest({
      tools: [
        { name: 't1', description: '1', input_schema: {} },
        { name: 't2', description: '2', input_schema: {} },
      ],
    });
    const result = applyPromptCache1hTtl(request);
    expect(result.tools?.[1]?.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    expect(result.tools?.[0]?.cache_control).toBeUndefined();
  });

  it('leaves request unchanged when no system/tools are provided', () => {
    const request = makeRequest();
    const result = applyPromptCache1hTtl(request);
    expect(result.system).toBeUndefined();
    expect(result.tools).toBeUndefined();
    expect(result).not.toBe(request);
  });
});

describe('applyPromptCache', () => {
  it('opts out of marking when cacheSystem=false / cacheTools=false', () => {
    const request = makeRequest({
      system: [{ type: 'text', text: 'a' }],
      tools: [{ name: 't', description: '', input_schema: {} }],
    });
    const result = applyPromptCache(request, {
      ttl: '1h',
      cacheSystem: false,
      cacheTools: false,
    });
    expect(result.system?.[0]?.cache_control).toBeUndefined();
    expect(result.tools?.[0]?.cache_control).toBeUndefined();
  });

  it('marks the last block of the last user turn when cacheLastUserTurn=true', () => {
    const request = makeRequest({
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'part a' },
            { type: 'text', text: 'part b' },
          ],
        },
      ],
    });
    const result = applyPromptCache(request, { ttl: '1h', cacheLastUserTurn: true });
    const lastUser = result.messages[result.messages.length - 1];
    const blocks = lastUser?.content ?? [];
    expect(blocks[0]?.type).toBe('text');
    const lastBlock = blocks[1];
    expect(lastBlock?.type).toBe('text');
    if (lastBlock?.type === 'text') {
      expect(lastBlock.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
    }
  });

  it('defaults to 5m marker when ttl omitted', () => {
    const request = makeRequest({ system: [{ type: 'text', text: 'a' }] });
    const result = applyPromptCache(request);
    expect(result.system?.[0]?.cache_control).toEqual({ type: 'ephemeral' });
  });
});

describe('upgradeExistingMarkers', () => {
  it('upgrades text block cache_control to TTL 1h', () => {
    const upgraded = upgradeExistingMarkers(
      { type: 'text', text: 'x', cache_control: { type: 'ephemeral' } },
      '1h',
    );
    if (upgraded.type !== 'text') throw new Error('expected text block');
    expect(upgraded.cache_control).toEqual({ type: 'ephemeral', ttl: '1h' });
  });

  it('is a no-op for blocks without cache_control', () => {
    const block = { type: 'text' as const, text: 'x' };
    expect(upgradeExistingMarkers(block)).toBe(block);
  });
});
