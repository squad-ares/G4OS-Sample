export type McpExecutionMode = 'auto' | 'container' | 'host';
export type McpResolvedMode = 'protected' | 'compat';

export interface RuntimeModeInput {
  readonly executionMode?: McpExecutionMode;
  readonly platform: NodeJS.Platform;
  readonly needsBrowserAuth?: boolean;
}

/**
 * Resolve MCP runtime mode:
 * - `host` → `compat` (explicit opt-in)
 * - `container` → `protected` (explicit)
 * - `auto` → `protected`, except Windows or browser-auth sources → `compat`
 *   (matches v1 CLAUDE.md local-MCP policy)
 */
export function resolveRuntimeMode(input: RuntimeModeInput): McpResolvedMode {
  const mode: McpExecutionMode = input.executionMode ?? 'auto';
  if (mode === 'host') return 'compat';
  if (mode === 'container') return 'protected';
  if (input.platform === 'win32') return 'compat';
  if (input.needsBrowserAuth === true) return 'compat';
  return 'protected';
}
