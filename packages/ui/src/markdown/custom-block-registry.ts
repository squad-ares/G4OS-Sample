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

export const customBlockRegistry = new CustomBlockRegistry();
