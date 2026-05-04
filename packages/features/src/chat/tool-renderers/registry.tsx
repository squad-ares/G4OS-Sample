/**
 * Registry de renderers de ferramentas.
 *
 * CR-37 F-CR37-10: usamos Map<name, ToolRenderer> com checagem de duplicata
 * para garantir idempotência. Registros via side-effect import (HMR ou
 * múltiplas importações em tests) não duplicam entradas.
 * `clearRegistryForTests()` expõe limpeza controlada para vitest.
 */
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

const rendererMap = new Map<string, ToolRenderer>();

export function registerToolRenderer(renderer: ToolRenderer): void {
  if (rendererMap.has(renderer.name)) return;
  rendererMap.set(renderer.name, renderer);
}

export function resolveToolRenderer(toolName: string, result: unknown): ToolRenderer | undefined {
  for (const renderer of rendererMap.values()) {
    if (renderer.canRender(toolName, result)) return renderer;
  }
  return undefined;
}

/** Apenas para testes — limpa o registry entre arquivos de teste. */
export function clearRegistryForTests(): void {
  rendererMap.clear();
}
