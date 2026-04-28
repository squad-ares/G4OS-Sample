import { err, ok, type Result } from 'neverthrow';

export const WORKSPACE_TRANSFER_VERSION = 1 as const;
export const WORKSPACE_TRANSFER_FORMAT = 'g4os-workspace-v1' as const;

export interface WorkspaceTransferManifest {
  readonly version: typeof WORKSPACE_TRANSFER_VERSION;
  readonly format: typeof WORKSPACE_TRANSFER_FORMAT;
  readonly exportedAt: number;
  readonly workspaceId: string;
  readonly workspaceSlug: string;
  readonly workspaceName: string;
  readonly originalRootPath: string;
  readonly includesCredentials: false;
  readonly filesCount: number;
}

export interface ManifestParseError {
  readonly reason: string;
}

/**
 * ADR-0011 (Result pattern): falha de validação de manifesto é caminho
 * esperado (input externo via ZIP do usuário), não bug. Devolvemos
 * `Result` para que o caller no main module consiga traduzir o erro para
 * IPC sem catch genérico.
 */
export function parseManifest(raw: unknown): Result<WorkspaceTransferManifest, ManifestParseError> {
  if (typeof raw !== 'object' || raw === null) {
    return err({ reason: 'invalid manifest: not an object' });
  }
  const m = raw as Record<string, unknown>;
  if (m['version'] !== WORKSPACE_TRANSFER_VERSION) {
    return err({ reason: `unsupported manifest version: ${String(m['version'])}` });
  }
  if (m['format'] !== WORKSPACE_TRANSFER_FORMAT) {
    return err({ reason: `invalid manifest format: ${String(m['format'])}` });
  }
  if (typeof m['exportedAt'] !== 'number') return err({ reason: 'invalid manifest: exportedAt' });
  if (typeof m['workspaceId'] !== 'string') return err({ reason: 'invalid manifest: workspaceId' });
  if (typeof m['workspaceSlug'] !== 'string') {
    return err({ reason: 'invalid manifest: workspaceSlug' });
  }
  if (typeof m['workspaceName'] !== 'string') {
    return err({ reason: 'invalid manifest: workspaceName' });
  }
  if (typeof m['originalRootPath'] !== 'string') {
    return err({ reason: 'invalid manifest: originalRootPath' });
  }
  if (m['includesCredentials'] !== false) {
    return err({ reason: 'manifest claims to include credentials' });
  }
  if (typeof m['filesCount'] !== 'number') return err({ reason: 'invalid manifest: filesCount' });
  return ok(raw as WorkspaceTransferManifest);
}

/**
 * Paths cujo nome (normalizado lowercase) contenha qualquer destes segmentos
 * ficam fora do ZIP. Protege contra vazamento acidental de credenciais,
 * tokens ou segredos quando o usuário coloca coisas dentro do workspace.
 */
export const SENSITIVE_PATH_SEGMENTS: readonly string[] = [
  'auth',
  'tokens',
  'secrets',
  'credentials',
  '.env',
  'private-keys',
];

export function isPathSensitive(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/').toLowerCase();
  const segments = normalized.split('/');
  return SENSITIVE_PATH_SEGMENTS.some((flagged) =>
    segments.some((segment) => segment === flagged || segment.startsWith(`${flagged}.`)),
  );
}
