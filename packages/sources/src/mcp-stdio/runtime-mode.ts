import { createLogger } from '@g4os/kernel/logger';

const log = createLogger('mcp-stdio:runtime-mode');

export type McpExecutionMode = 'auto' | 'container' | 'host';
export type McpResolvedMode = 'protected' | 'compat';

export interface RuntimeModeInput {
  readonly executionMode?: McpExecutionMode;
  readonly platform: NodeJS.Platform;
  readonly needsBrowserAuth?: boolean;
  /** Slug para enriquecer log de fallback. */
  readonly slug?: string;
}

/**
 * Resolve MCP runtime mode:
 * - `host` → `compat` (explicit opt-in)
 * - `container` → `protected` (explicit; Windows downgrade pra compat)
 * - `auto` → `protected`, except Windows or browser-auth sources → `compat`
 *   (matches v1 CLAUDE.md local-MCP policy)
 *
 * Quando user pediu `container` mas Windows força `compat`, logamos
 * pra o usuário entender por que isolamento não foi aplicado. Sem isso,
 * a expectativa de sandbox protegido era violada silenciosamente.
 */
export function resolveRuntimeMode(input: RuntimeModeInput): McpResolvedMode {
  const mode: McpExecutionMode = input.executionMode ?? 'auto';
  if (mode === 'host') return 'compat';
  if (mode === 'container') {
    if (input.platform === 'win32') {
      log.warn(
        { slug: input.slug, platform: input.platform },
        'container mode requested but not supported on Windows; falling back to compat',
      );
      return 'compat';
    }
    return 'protected';
  }
  if (input.platform === 'win32') return 'compat';
  if (input.needsBrowserAuth === true) return 'compat';
  return 'protected';
}
