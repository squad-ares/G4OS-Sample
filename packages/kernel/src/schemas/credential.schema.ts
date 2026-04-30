import { z } from 'zod';

/**
 * Schema Zod para metadata de credencial — permite ao caller distinguir
 * "meta inválida/legacy" de "criptografia corrompida" em vez de `decryptFailed` genérico.
 */
export const CredentialMetaSchema = z.object({
  key: z.string().min(1).max(200),
  createdAt: z.number().int().finite().nonnegative(),
  updatedAt: z.number().int().finite().nonnegative(),
  expiresAt: z.number().int().finite().positive().optional(),
  tags: z.array(z.string().min(1).max(64)).max(32),
});

export type CredentialMetaParsed = z.infer<typeof CredentialMetaSchema>;
