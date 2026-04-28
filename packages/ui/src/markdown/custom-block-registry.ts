import type { ComponentType } from 'react';

type CustomBlockComponent = ComponentType<{ children: string }>;

class CustomBlockRegistry {
  private readonly renderers = new Map<string, CustomBlockComponent>();

  register(lang: string, component: CustomBlockComponent): void {
    this.renderers.set(lang, component);
  }

  unregister(lang: string): boolean {
    return this.renderers.delete(lang);
  }

  getRenderer(lang: string): CustomBlockComponent | undefined {
    return this.renderers.get(lang);
  }

  has(lang: string): boolean {
    return this.renderers.has(lang);
  }
}

// Safe as a module singleton: each Electron renderer runs in its own V8 isolate,
// so windows never share this instance. Tests that register custom renderers must
// call unregister() in afterEach to avoid cross-test pollution.
export const customBlockRegistry = new CustomBlockRegistry();
