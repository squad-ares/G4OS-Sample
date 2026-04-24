import type { ToolDefinition } from '@g4os/kernel';
import type { ToolCatalog, ToolHandler } from './types.ts';

export class ToolRegistry implements ToolCatalog {
  readonly #handlers = new Map<string, ToolHandler>();

  register(handler: ToolHandler): void {
    const name = handler.definition.name;
    if (this.#handlers.has(name)) {
      throw new Error(`Tool already registered: ${name}`);
    }
    this.#handlers.set(name, handler);
  }

  unregister(name: string): boolean {
    return this.#handlers.delete(name);
  }

  get(name: string): ToolHandler | undefined {
    return this.#handlers.get(name);
  }

  list(): readonly ToolDefinition[] {
    return [...this.#handlers.values()].map((h) => h.definition);
  }

  clear(): void {
    this.#handlers.clear();
  }

  get size(): number {
    return this.#handlers.size;
  }
}

export function createToolRegistry(handlers: readonly ToolHandler[] = []): ToolRegistry {
  const registry = new ToolRegistry();
  for (const handler of handlers) {
    registry.register(handler);
  }
  return registry;
}
