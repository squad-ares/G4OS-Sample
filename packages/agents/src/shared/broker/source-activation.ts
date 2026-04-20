export type SourceAccessState = 'not_enabled' | 'auth_required' | 'incompatible' | 'ok';

export interface SourceManagerLike {
  getSourceAccessState(toolName: string): SourceAccessState | null;
  resolveSourceSlugForTool(toolName: string): string | null;
}

const BROKERED_ACTIVATION_TOOL = 'activate_sources';

export function detectSourceAccessIssue(
  toolName: string,
  _result: unknown,
  isError: boolean,
  sourceManager: SourceManagerLike,
): { readonly sourceSlug: string; readonly state: SourceAccessState } | null {
  if (!isError) {
    return null;
  }
  const slug = sourceManager.resolveSourceSlugForTool(toolName);
  if (slug === null) {
    return null;
  }
  const state = sourceManager.getSourceAccessState(toolName);
  if (state === null || state === 'ok') {
    return null;
  }
  return { sourceSlug: slug, state };
}

export function detectBrokeredSourceActivation(
  toolName: string,
  result: unknown,
  isError: boolean,
): { readonly sourceSlug: string } | null {
  if (toolName !== BROKERED_ACTIVATION_TOOL || isError) {
    return null;
  }
  if (typeof result !== 'object' || result === null) {
    return null;
  }
  const record = result as Record<string, unknown>;
  const slug = record['sourceSlug'];
  if (typeof slug !== 'string' || slug.length === 0) {
    return null;
  }
  return { sourceSlug: slug };
}
