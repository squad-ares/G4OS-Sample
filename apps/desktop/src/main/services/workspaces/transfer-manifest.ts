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

export function parseManifest(raw: unknown): WorkspaceTransferManifest {
  if (typeof raw !== 'object' || raw === null) throw new Error('invalid manifest: not an object');
  const m = raw as Record<string, unknown>;
  if (m['version'] !== WORKSPACE_TRANSFER_VERSION)
    throw new Error(`unsupported manifest version: ${String(m['version'])}`);
  if (m['format'] !== WORKSPACE_TRANSFER_FORMAT)
    throw new Error(`invalid manifest format: ${String(m['format'])}`);
  if (typeof m['exportedAt'] !== 'number') throw new Error('invalid manifest: exportedAt');
  if (typeof m['workspaceId'] !== 'string') throw new Error('invalid manifest: workspaceId');
  if (typeof m['workspaceSlug'] !== 'string') throw new Error('invalid manifest: workspaceSlug');
  if (typeof m['workspaceName'] !== 'string') throw new Error('invalid manifest: workspaceName');
  if (typeof m['originalRootPath'] !== 'string')
    throw new Error('invalid manifest: originalRootPath');
  if (m['includesCredentials'] !== false) throw new Error('manifest claims to include credentials');
  if (typeof m['filesCount'] !== 'number') throw new Error('invalid manifest: filesCount');
  return raw as WorkspaceTransferManifest;
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
