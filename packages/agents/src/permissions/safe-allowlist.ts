export const SAFE_MODE_ALLOWED_TOOLS: ReadonlySet<string> = new Set([
  'read_file',
  'Read',
  'Glob',
  'Grep',
  'LS',
  'WebFetch',
  'WebSearch',
  'local_context',
  'activate_sources',
  'list_sources',
  'request_user_input',
]);

export const SAFE_MODE_FORBIDDEN_TOOLS: ReadonlySet<string> = new Set([
  'Bash',
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
  'file_write',
  'shell_exec',
  'delete_file',
]);

export type SafeClassification = 'allowed' | 'forbidden' | 'unknown';

export function classifyForSafeMode(toolName: string): SafeClassification {
  if (SAFE_MODE_FORBIDDEN_TOOLS.has(toolName)) {
    return 'forbidden';
  }
  if (SAFE_MODE_ALLOWED_TOOLS.has(toolName)) {
    return 'allowed';
  }
  return 'unknown';
}
