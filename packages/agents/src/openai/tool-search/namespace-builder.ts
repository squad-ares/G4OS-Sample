import type { OpenAIToolParam } from '../types.ts';

export interface NamespacedToolGroup {
  readonly namespace: string;
  readonly tools: readonly OpenAIToolParam[];
  readonly deferLoading: boolean;
}

export function supportsToolSearch(modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (id.startsWith('gpt-5.4')) return true;
  if (id.startsWith('gpt-5.5') || id.startsWith('gpt-5.6')) return true;
  return false;
}

function extractNamespace(toolName: string): string {
  const idx = toolName.indexOf('__');
  return idx === -1 ? 'core' : toolName.slice(0, idx);
}

export function buildToolSearchNamespaces(
  tools: readonly OpenAIToolParam[],
): NamespacedToolGroup[] {
  const groups = new Map<string, OpenAIToolParam[]>();
  for (const tool of tools) {
    const ns = extractNamespace(tool.function.name);
    const bucket = groups.get(ns);
    if (bucket === undefined) {
      groups.set(ns, [tool]);
    } else {
      bucket.push(tool);
    }
  }
  return [...groups.entries()].map(([namespace, grouped]) => ({
    namespace,
    tools: grouped,
    deferLoading: namespace !== 'core',
  }));
}
