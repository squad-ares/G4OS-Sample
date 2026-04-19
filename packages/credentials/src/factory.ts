/**
 * Factory para `CredentialVault`. Concentra a decisão de backend
 * (safeStorage em prod, file+plaintext em dev, in-memory em test) para
 * que callers sigam apenas `createVault(...)`.
 *
 * `mode` é explícito e sem inferência de `NODE_ENV` (evita acoplar ao
 * ambiente e respeita `noProcessEnv`). Quem instancia é a camada
 * `apps/desktop/src/main/*`, que já decide o flavor no boot.
 */

import { join } from 'node:path';
import { getAppPaths } from '@g4os/platform';
import {
  createPlaintextCodec,
  FileKeychain,
  InMemoryKeychain,
  loadSafeStorageCodec,
} from './backends/index.ts';
import { CredentialVault } from './vault.ts';

export type VaultMode = 'prod' | 'dev' | 'test';

export interface CreateVaultOptions {
  readonly mode: VaultMode;
  readonly baseDir?: string;
}

const DEFAULT_SUBDIR = 'secrets';

export async function createVault(options: CreateVaultOptions): Promise<CredentialVault> {
  if (options.mode === 'test') {
    return new CredentialVault(new InMemoryKeychain());
  }

  const baseDir = options.baseDir ?? join(getAppPaths().data, DEFAULT_SUBDIR);

  if (options.mode === 'dev') {
    return new CredentialVault(new FileKeychain({ baseDir, codec: createPlaintextCodec() }));
  }

  const codec = await loadSafeStorageCodec();
  return new CredentialVault(new FileKeychain({ baseDir, codec }));
}
