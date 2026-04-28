import { z } from 'zod';

/**
 * CR8-09: schema Zod para metadata de credencial. Antes, `vault.readMeta`
 * fazia `JSON.parse(...) as CredentialMeta` sem validação — meta corrompida
 * (versão antiga, write parcial, tampering) caía em `decryptFailed` genérico
 * em vez de detectar mismatch de schema. O schema explícito permite ao caller
 * distinguir "meta inválida/legacy" de "criptografia corrompida".
 */
export const CredentialMetaSchema = z.object({
  key: z.string().min(1).max(200),
  createdAt: z.number().int().finite().nonnegative(),
  updatedAt: z.number().int().finite().nonnegative(),
  expiresAt: z.number().int().finite().positive().optional(),
  tags: z.array(z.string().min(1).max(64)).max(32),
});

export type CredentialMetaParsed = z.infer<typeof CredentialMetaSchema>;
