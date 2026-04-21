import type { ComponentType } from 'react';

export interface ToolRendererComponent {
  result: unknown;
  toolUseId: string;
}

export interface ToolRenderer {
  readonly name: string;
  canRender(toolName: string, result: unknown): boolean;
  readonly Component: ComponentType<ToolRendererComponent>;
}

const renderers: ToolRenderer[] = [];

export function registerToolRenderer(renderer: ToolRenderer): void {
  renderers.push(renderer);
}

export function resolveToolRenderer(toolName: string, result: unknown): ToolRenderer | undefined {
  return renderers.find((r) => r.canRender(toolName, result));
}
