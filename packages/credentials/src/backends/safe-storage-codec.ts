/**
 * SafeStorageCodec — adapta `electron.safeStorage` (OS keychain nativo
 * via Keychain/DPAPI/libsecret) para o `SecretCodec` do FileKeychain.
 *
 * Carregado via import dinâmico para manter o pacote compilável sem
 * electron no classpath (CI sem build de Electron; `ignoreMissing` em
 * `pnpm` no root). Chamar `loadSafeStorageCodec()` a partir do main
 * process após `app.whenReady()`.
 */

import type { SecretCodec } from './file-backend.ts';

interface SafeStorageLike {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(payload: Buffer): string;
}

interface ElectronLike {
  readonly safeStorage: SafeStorageLike;
}

const SPECIFIER = 'electron';

export async function loadSafeStorageCodec(): Promise<SecretCodec> {
  const mod = (await import(/* @vite-ignore */ SPECIFIER)) as ElectronLike;
  const store = mod.safeStorage;
  return {
    get available() {
      return store.isEncryptionAvailable();
    },
    encrypt: (value: string) => store.encryptString(value),
    decrypt: (payload: Buffer) => store.decryptString(payload),
  };
}

/** Codec noop para dev/test: não encripta, apenas passa bytes. */
export function createPlaintextCodec(): SecretCodec {
  return {
    available: true,
    encrypt: (value: string) => Buffer.from(value, 'utf-8'),
    decrypt: (payload: Buffer) => payload.toString('utf-8'),
  };
}
