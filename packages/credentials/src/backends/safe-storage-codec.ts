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
  // F-CR35-8: valida shape do módulo antes de usar. Import dinâmico pode
  // retornar um objeto sem `safeStorage` (versão antiga, runtime não-Electron,
  // mock incompleto em testes). Sem validação, `store.isEncryptionAvailable()`
  // lançaria TypeError síncrono no getter `available`, escapando do try/catch
  // de `file-backend.ts` e violando ADR-0011 (erros esperados são tipos).
  const store = mod?.safeStorage;
  if (
    typeof store?.isEncryptionAvailable !== 'function' ||
    typeof store?.encryptString !== 'function' ||
    typeof store?.decryptString !== 'function'
  ) {
    // Retorna codec com `available: false` — vault usará o caminho `locked`.
    return {
      available: false,
      encrypt: (_value: string): Buffer => Buffer.alloc(0),
      decrypt: (_payload: Buffer): string => '',
    };
  }
  return {
    get available() {
      // Wrapper defensivo: se isEncryptionAvailable() lançar (estado interno
      // do Electron inconsistente), retorna false em vez de propagar throw.
      try {
        return store.isEncryptionAvailable();
      } catch {
        return false;
      }
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
