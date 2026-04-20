const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnv1a(input: string): string {
  let hash = FNV_OFFSET;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export interface PromptCacheKeyInput {
  readonly workspaceId?: string;
  readonly connectionSlug: string;
  readonly toolNames: readonly string[];
}

export function buildPromptCacheKey(input: PromptCacheKeyInput): string {
  const workspace = input.workspaceId ?? '_';
  const sortedTools = [...input.toolNames].sort().join('|');
  const fingerprint = `${workspace}::${input.connectionSlug}::${sortedTools}`;
  return `g4_${fnv1a(fingerprint)}`;
}
