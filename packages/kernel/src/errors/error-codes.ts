/**
 * Códigos de erro canônicos. Cada area tem prefixo.
 * Usado para i18n, telemetry, logs.
 */

export const ErrorCode = {
  // Credenciais
  CREDENTIAL_NOT_FOUND: 'credential.not_found',
  CREDENTIAL_LOCKED: 'credential.locked',
  CREDENTIAL_DECRYPT_FAILED: 'credential.decrypt_failed',
  CREDENTIAL_EXPIRED: 'credential.expired',
  CREDENTIAL_INVALID_KEY: 'credential.invalid_key',
  CREDENTIAL_INVALID_VALUE: 'credential.invalid_value',

  // Autenticação
  AUTH_NOT_AUTHENTICATED: 'auth.not_authenticated',
  AUTH_TOKEN_EXPIRED: 'auth.token_expired',
  AUTH_OTP_INVALID: 'auth.otp_invalid',
  AUTH_ENTITLEMENT_REQUIRED: 'auth.entitlement_required',
  AUTH_BOOTSTRAP_FAILED: 'auth.bootstrap_failed',
  AUTH_DISPOSED: 'auth.disposed',

  // IPC
  IPC_HANDLER_NOT_FOUND: 'ipc.handler_not_found',
  IPC_INVALID_PAYLOAD: 'ipc.invalid_payload',
  IPC_TIMEOUT: 'ipc.timeout',

  // Session
  SESSION_NOT_FOUND: 'session.not_found',
  SESSION_CORRUPTED: 'session.corrupted',
  SESSION_LOCKED: 'session.locked',

  // Workspace
  WORKSPACE_NOT_FOUND: 'workspace.not_found',
  WORKSPACE_CORRUPTED: 'workspace.corrupted',
  WORKSPACE_BOOTSTRAP_FAILED: 'workspace.bootstrap_failed',
  WORKSPACE_SLUG_CONFLICT: 'workspace.slug_conflict',

  // Project
  PROJECT_NOT_FOUND: 'project.not_found',
  PROJECT_SLUG_CONFLICT: 'project.slug_conflict',

  // Agent
  AGENT_UNAVAILABLE: 'agent.unavailable',
  AGENT_RATE_LIMITED: 'agent.rate_limited',
  AGENT_INVALID_INPUT: 'agent.invalid_input',
  AGENT_NETWORK: 'agent.network',
  AGENT_INVALID_API_KEY: 'agent.invalid_api_key',

  // Source / MCP
  SOURCE_NOT_FOUND: 'source.not_found',
  SOURCE_AUTH_REQUIRED: 'source.auth_required',
  SOURCE_INCOMPATIBLE: 'source.incompatible',

  // FS / Platform
  FS_ACCESS_DENIED: 'fs.access_denied',
  FS_NOT_FOUND: 'fs.not_found',
  FS_DISK_FULL: 'fs.disk_full',
  FS_PATH_TRAVERSAL: 'fs.path_traversal',
  FS_FILE_TOO_LARGE: 'fs.file_too_large',

  // Generic
  VALIDATION_ERROR: 'validation.error',
  NETWORK_ERROR: 'network.error',
  UNKNOWN_ERROR: 'unknown.error',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
