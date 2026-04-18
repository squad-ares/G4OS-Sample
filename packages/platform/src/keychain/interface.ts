import type { CredentialError, Result } from '@g4os/kernel/errors';

export interface IKeychain {
  /** Armazena segredo no keychain do OS */
  set(key: string, value: string): Promise<Result<void, CredentialError>>;

  /** Recupera segredo */
  get(key: string): Promise<Result<string, CredentialError>>;

  /** Remove segredo */
  delete(key: string): Promise<Result<void, CredentialError>>;

  /** Lista chaves armazenadas (não retorna valores) */
  list(): Promise<Result<string[], CredentialError>>;
}
