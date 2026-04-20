import { describe, expect, it } from 'vitest';
import {
  buildToolSearchNamespaces,
  supportsToolSearch,
} from '../../openai/tool-search/namespace-builder.ts';
import type { OpenAIToolParam } from '../../openai/types.ts';

function makeTool(name: string): OpenAIToolParam {
  return {
    type: 'function',
    function: { name, description: 'test', parameters: {} },
  };
}

describe('supportsToolSearch', () => {
  it('returns true for gpt-5.4+', () => {
    expect(supportsToolSearch('gpt-5.4')).toBe(true);
    expect(supportsToolSearch('gpt-5.5')).toBe(true);
    expect(supportsToolSearch('gpt-5.6')).toBe(true);
  });

  it('returns false for gpt-4o, gpt-5.3, and older', () => {
    expect(supportsToolSearch('gpt-4o')).toBe(false);
    expect(supportsToolSearch('gpt-5.3')).toBe(false);
    expect(supportsToolSearch('gpt-5')).toBe(false);
  });
});

describe('buildToolSearchNamespaces', () => {
  it('puts tools without __ into "core" namespace', () => {
    const result = buildToolSearchNamespaces([makeTool('read_file'), makeTool('bash')]);
    expect(result).toHaveLength(1);
    expect(result[0]?.namespace).toBe('core');
    expect(result[0]?.deferLoading).toBe(false);
  });

  it('splits tools with __ into named namespaces (splits on first __)', () => {
    const tools = [makeTool('mcp__github__list_prs'), makeTool('mcp__github__create_issue')];
    const result = buildToolSearchNamespaces(tools);
    expect(result).toHaveLength(1);
    expect(result[0]?.namespace).toBe('mcp');
    expect(result[0]?.deferLoading).toBe(true);
    expect(result[0]?.tools).toHaveLength(2);
  });

  it('groups core and named namespaces separately', () => {
    const tools = [makeTool('read_file'), makeTool('mcp__slack__send')];
    const result = buildToolSearchNamespaces(tools);
    expect(result).toHaveLength(2);
    const namespaces = result.map((g) => g.namespace).sort();
    expect(namespaces).toEqual(['core', 'mcp'].sort());
  });

  it('non-core namespaces have deferLoading=true', () => {
    const result = buildToolSearchNamespaces([makeTool('ns__tool__action')]);
    expect(result[0]?.deferLoading).toBe(true);
  });

  it('returns empty array for no tools', () => {
    expect(buildToolSearchNamespaces([])).toEqual([]);
  });
});
