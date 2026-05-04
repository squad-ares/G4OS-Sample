/**
 * CredentialsService — implementação do contract IPC sobre CredentialVault.
 *
 * Encapsula erros do vault (`CredentialError`) em `AppError` para o transporte
 * tRPC. Lista retorna metadata (sem valores) pra evitar vazar chaves no wire.
 */

import type { CredentialVault } from '@g4os/credentials';
import type {
  CredentialMetaView,
  CredentialSetOptions,
  CredentialsService as CredentialsServiceContract,
} from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { err, ok, type Result } from 'neverthrow';

const log = createLogger('credentials-service');

export interface CredentialsServiceDeps {
  readonly vault: CredentialVault;
  readonly onMutation?: (key: string) => void | Promise<void>;
}

export class VaultCredentialsService implements CredentialsServiceContract {
  readonly #vault: CredentialVault;
  readonly #onMutation?: (key: string) => void | Promise<void>;

  constructor(deps: CredentialsServiceDeps) {
    this.#vault = deps.vault;
    if (deps.onMutation) this.#onMutation = deps.onMutation;
  }

  async get(key: string): Promise<Result<string, AppError>> {
    const result = await this.#vault.get(key);
    if (result.isErr()) return err(toAppError('credentials.get', result.error, { key }));
    return ok(result.value);
  }

  async set(
    key: string,
    value: string,
    options?: CredentialSetOptions,
  ): Promise<Result<void, AppError>> {
    const vaultOptions = options
      ? {
          ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }),
          ...(options.tags === undefined ? {} : { tags: options.tags }),
        }
      : {};
    const result = await this.#vault.set(key, value, vaultOptions);
    if (result.isErr()) return err(toAppError('credentials.set', result.error, { key }));
    await this.#notifyMutation(key);
    return ok(undefined);
  }

  async delete(key: string): Promise<Result<void, AppError>> {
    const result = await this.#vault.delete(key);
    if (result.isErr()) return err(toAppError('credentials.delete', result.error, { key }));
    await this.#notifyMutation(key);
    return ok(undefined);
  }

  async list(): Promise<Result<readonly CredentialMetaView[], AppError>> {
    const result = await this.#vault.list();
    if (result.isErr()) return err(toAppError('credentials.list', result.error));
    const metas: CredentialMetaView[] = result.value.map((m) => ({
      key: m.key,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      ...(m.expiresAt === undefined ? {} : { expiresAt: m.expiresAt }),
      tags: [...m.tags],
      // F-CR35-9: propaga `stale` do vault — entry com meta corrompida.
      // Sem este campo, UI nunca recebia o sinal e operador não podia acionar repair.
      ...(m.stale === true ? { stale: true as const } : {}),
    }));
    return ok(metas);
  }

  // F-CR35-2: `options` (incluindo `expiresAt`) propagado para o vault.
  async rotate(
    key: string,
    newValue: string,
    options?: CredentialSetOptions,
  ): Promise<Result<void, AppError>> {
    const vaultOptions = options
      ? {
          ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }),
          ...(options.tags === undefined ? {} : { tags: options.tags }),
        }
      : {};
    const result = await this.#vault.rotate(key, newValue, vaultOptions);
    if (result.isErr()) return err(toAppError('credentials.rotate', result.error, { key }));
    await this.#notifyMutation(key);
    return ok(undefined);
  }

  async #notifyMutation(key: string): Promise<void> {
    if (!this.#onMutation) return;
    try {
      await this.#onMutation(key);
    } catch (error) {
      log.warn({ err: error, key }, 'onMutation hook threw');
    }
  }
}

export function createCredentialsService(deps: CredentialsServiceDeps): CredentialsServiceContract {
  return new VaultCredentialsService(deps);
}

function toAppError(
  scope: string,
  cause: { readonly code: string; readonly message: string },
  context?: Record<string, unknown>,
): AppError {
  log.warn({ scope, code: cause.code, message: cause.message, context }, 'vault error');
  return new AppError({
    code: ErrorCode.UNKNOWN_ERROR,
    message: `${scope}: ${cause.message}`,
    ...(context ? { context } : {}),
  });
}
