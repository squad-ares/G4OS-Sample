/**
 * Manifest versioning — toda mudança de formato deve bumpar `version`
 * e atualizar a tabela de compatibilidade abaixo. `import.ts` rejeita
 * versões desconhecidas.
 */

import { z } from 'zod';

export const BACKUP_MANIFEST_VERSION = 1 as const;

export const BackupManifestSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number().int().positive(),
  workspaceId: z.uuid(),
  workspaceName: z.string(),
  sessionIds: z.array(z.uuid()),
  attachmentHashes: z.array(z.string().regex(/^[a-f0-9]{64}$/)),
  appVersion: z.string().optional(),
});

export type BackupManifest = z.infer<typeof BackupManifestSchema>;
