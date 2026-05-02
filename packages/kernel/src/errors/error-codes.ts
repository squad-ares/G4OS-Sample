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
  // CR-18 F-C5: discriminado de `DECRYPT_FAILED` — erros de IO em
  // FileKeychain (mkdir EACCES, writeAtomic ENOSPC, readdir fail) NÃO
  // significam que a chave está corrompida criptograficamente. Caller que
  // faz `switch (err.code)` confundia IO com chave corrupta e rodava
  // fluxo de repair errado.
  CREDENTIAL_IO_ERROR: 'credential.io_error',

  // Autenticação
  AUTH_NOT_AUTHENTICATED: 'auth.not_authenticated',
  AUTH_TOKEN_EXPIRED: 'auth.token_expired',
  AUTH_OTP_INVALID: 'auth.otp_invalid',
  AUTH_ENTITLEMENT_REQUIRED: 'auth.entitlement_required',
  AUTH_BOOTSTRAP_FAILED: 'auth.bootstrap_failed',
  AUTH_DISPOSED: 'auth.disposed',
  // CR-18 F-AU3: discriminado de `AUTH_DISPOSED` — flow conflict (chamada
  // requestOtp/submitOtp durante verifying/bootstrapping/requesting_otp)
  // não significa que o serviço está disposed. Caller que tratava por
  // `code === AUTH_DISPOSED` disparava shutdown indevido.
  AUTH_FLOW_IN_PROGRESS: 'auth.flow_in_progress',

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
  // CR-27 F-CR27-4: errnos genéricos que não são EACCES/EPERM (locked file
  // EBUSY, read-only filesystem EROFS, name too long ENAMETOOLONG, EISDIR,
  // ENOTDIR, etc.). Antes mapeados para FS_ACCESS_DENIED — confundia callers
  // que sugeriam "verifique permissões" quando o problema era outra classe
  // de IO. UI/Repair pode discriminar via `code === FS_IO_ERROR` + ler errno
  // de `context.errno` para mensagem específica.
  FS_IO_ERROR: 'fs.io_error',

  // Generic
  VALIDATION_ERROR: 'validation.error',
  NETWORK_ERROR: 'network.error',
  UNKNOWN_ERROR: 'unknown.error',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
