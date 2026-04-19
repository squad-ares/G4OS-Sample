/**
 * InMemoryKeychain — backend volátil usado em testes/dev.
 * Não persiste entre restarts; nada é criptografado.
 */

import type { CredentialError, Result } from '@g4os/kernel/errors';
import { CredentialError as CredentialErrorClass } from '@g4os/kernel/errors';
import type { IKeychain } from '@g4os/platform';
import { err, ok } from 'neverthrow';

export class InMemoryKeychain implements IKeychain {
  private readonly store = new Map<string, string>();

  set(key: string, value: string): Promise<Result<void, CredentialError>> {
    this.store.set(key, value);
    return Promise.resolve(ok(undefined));
  }

  get(key: string): Promise<Result<string, CredentialError>> {
    const value = this.store.get(key);
    if (value === undefined) return Promise.resolve(err(CredentialErrorClass.notFound(key)));
    return Promise.resolve(ok(value));
  }

  delete(key: string): Promise<Result<void, CredentialError>> {
    this.store.delete(key);
    return Promise.resolve(ok(undefined));
  }

  list(): Promise<Result<string[], CredentialError>> {
    return Promise.resolve(ok(Array.from(this.store.keys())));
  }
}
