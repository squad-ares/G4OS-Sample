/**
 * Adapters `AuthTokenStore` para o wiring do `@g4os/auth`.
 *
 * - `createVaultBackedTokenStore(vault)` — produção; persiste via
 *   `CredentialVault` (safeStorage/DPAPI/libsecret + mutex + backups).
 * - `createInMemoryTokenStore()` — fallback usado apenas em testes ou
 *   quando o vault ainda não foi composto no bootstrap.
 */

import type { AuthTokenStore } from '@g4os/auth';
import type { CredentialVault } from '@g4os/credentials';
import { AuthError, ErrorCode } from '@g4os/kernel/errors';
import { err, ok } from 'neverthrow';

export function createVaultBackedTokenStore(vault: CredentialVault): AuthTokenStore {
  const toAuthError = (scope: string, message: string): AuthError =>
    new AuthError({
      code: ErrorCode.AUTH_NOT_AUTHENTICATED,
      message: scope,
      context: { cause: message },
    });

  return {
    get: async (key) => {
      const result = await vault.get(key);
      if (result.isErr())
        return err(toAuthError(`Falha ao ler credencial ${key}`, result.error.message));
      return ok(result.value);
    },
    set: async (key, value, meta) => {
      const result = await vault.set(
        key,
        value,
        meta?.expiresAt === undefined ? undefined : { expiresAt: meta.expiresAt },
      );
      if (result.isErr())
        return err(toAuthError(`Falha ao persistir credencial ${key}`, result.error.message));
      return ok(undefined);
    },
    delete: async (key) => {
      const result = await vault.delete(key);
      if (result.isErr())
        return err(toAuthError(`Falha ao remover credencial ${key}`, result.error.message));
      return ok(undefined);
    },
    list: async () => {
      const result = await vault.list();
      if (result.isErr())
        return err(toAuthError('Falha ao listar credenciais', result.error.message));
      const entries = result.value.map((meta) =>
        meta.expiresAt === undefined
          ? { key: meta.key }
          : { key: meta.key, expiresAt: meta.expiresAt },
      );
      return ok(entries);
    },
  };
}

export function createInMemoryTokenStore(): AuthTokenStore {
  const values = new Map<string, { value: string; expiresAt?: number }>();
  return {
    get: (key) => {
      const entry = values.get(key);
      if (!entry) return Promise.resolve(err(AuthError.notAuthenticated()));
      return Promise.resolve(ok(entry.value));
    },
    set: (key, value, meta) => {
      values.set(key, meta?.expiresAt ? { value, expiresAt: meta.expiresAt } : { value });
      return Promise.resolve(ok(undefined));
    },
    delete: (key) => {
      values.delete(key);
      return Promise.resolve(ok(undefined));
    },
    list: () => {
      const entries = Array.from(values.entries()).map(([key, entry]) =>
        entry.expiresAt === undefined ? { key } : { key, expiresAt: entry.expiresAt },
      );
      return Promise.resolve(ok(entries));
    },
  };
}
