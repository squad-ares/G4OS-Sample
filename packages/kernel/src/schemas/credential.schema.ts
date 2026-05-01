import { z } from 'zod';

/**
 * Schema Zod para metadata de credencial — permite ao caller distinguir
 * "meta inválida/legacy" de "criptografia corrompida" em vez de
 * `decryptFailed` genérico.
 *
 * CR-18 F-C4: `key.max(100)` alinha com `KEY_MAX_LENGTH` em
 * `@g4os/credentials/vault.ts`. Antes era 200 — caller que passasse 150
 * chars passava no schema mas falhava em `vault.set` com `invalidKey`.
 */
export const CredentialMetaSchema = z.object({
  key: z.string().min(1).max(100),
  createdAt: z.number().int().finite().nonnegative(),
  updatedAt: z.number().int().finite().nonnegative(),
  expiresAt: z.number().int().finite().positive().optional(),
  tags: z.array(z.string().min(1).max(64)).max(32),
});

export type CredentialMetaParsed = z.infer<typeof CredentialMetaSchema>;
