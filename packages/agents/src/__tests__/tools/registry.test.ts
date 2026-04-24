import { ok } from 'neverthrow';
import { describe, expect, it } from 'vitest';
import { createToolRegistry, ToolRegistry } from '../../tools/registry.ts';
import type { ToolHandler } from '../../tools/types.ts';

function makeHandler(name: string): ToolHandler {
  return {
    definition: { name, description: `${name} handler`, inputSchema: { type: 'object' } },
    execute: async () => ok({ output: 'ok' }),
  };
}

describe('ToolRegistry', () => {
  it('registers and retrieves handlers', () => {
    const registry = new ToolRegistry();
    const handler = makeHandler('read_file');
    registry.register(handler);
    expect(registry.get('read_file')).toBe(handler);
    expect(registry.size).toBe(1);
  });

  it('throws on duplicate registration', () => {
    const registry = new ToolRegistry();
    registry.register(makeHandler('read_file'));
    expect(() => registry.register(makeHandler('read_file'))).toThrow(/already registered/);
  });

  it('lists definitions', () => {
    const registry = new ToolRegistry();
    registry.register(makeHandler('a'));
    registry.register(makeHandler('b'));
    expect(
      registry
        .list()
        .map((d) => d.name)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  it('unregister removes handler', () => {
    const registry = new ToolRegistry();
    registry.register(makeHandler('x'));
    expect(registry.unregister('x')).toBe(true);
    expect(registry.unregister('x')).toBe(false);
    expect(registry.size).toBe(0);
  });

  it('clear empties registry', () => {
    const registry = new ToolRegistry();
    registry.register(makeHandler('a'));
    registry.register(makeHandler('b'));
    registry.clear();
    expect(registry.size).toBe(0);
  });

  it('createToolRegistry seeds handlers', () => {
    const registry = createToolRegistry([makeHandler('a'), makeHandler('b')]);
    expect(registry.size).toBe(2);
  });
});
