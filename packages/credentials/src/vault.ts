/**
 * CredentialVault — gateway único para credenciais.
 *
 * Garantias:
 *   - Mutex de escrita previne race conditions (v1 tinha 93 arquivos
 *     tocando em `credentials.enc` sem coordenação → perdas).
 *   - Cada `set`/`delete` faz snapshot da versão anterior como
 *     `<key>.backup-<ts>`. Mantém no máximo `BACKUP_RETENTION`.
 *   - Metadata separada (`<key>.meta`) guarda createdAt/updatedAt/
 *     expiresAt/tags — não poluí o valor.
 *   - Expiração automática: `get` apaga e retorna `expired` se vencida.
 *
 * Toda criptografia/persistência é delegada a um `IKeychain`. O vault
 * é agnóstico a backend (safeStorage, in-memory, etc.).
 */

import type { CredentialError, Result } from '@g4os/kernel/errors';
import { CredentialError as CredentialErrorClass } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import type { IKeychain } from '@g4os/platform';
import { Mutex } from 'async-mutex';
import { err, ok } from 'neverthrow';

const log = createLogger('credential-vault');

const META_SUFFIX = '.meta';
const BACKUP_SEPARATOR = '.backup-';
const BACKUP_RETENTION = 3;
const KEY_PATTERN = /^[a-z0-9._-]+$/i;
const KEY_MAX_LENGTH = 100;
const VALUE_MAX_LENGTH = 1_000_000;

export interface CredentialMeta {
  readonly key: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly expiresAt?: number;
  readonly tags: readonly string[];
}

export interface SetOptions {
  readonly expiresAt?: number;
  readonly tags?: readonly string[];
}

export class CredentialVault {
  private readonly writeLock = new Mutex();

  constructor(private readonly keychain: IKeychain) {}

  async get(key: string): Promise<Result<string, CredentialError>> {
    const validation = validateKey(key);
    if (validation.isErr()) return err(validation.error);

    const result = await this.keychain.get(key);
    if (result.isErr()) return err(result.error);

    const meta = await this.readMeta(key);
    if (meta.isOk() && meta.value.expiresAt !== undefined && meta.value.expiresAt < Date.now()) {
      log.warn({ key }, 'credential expired — auto-deleting');
      await this.deleteInternal(key);
      return err(CredentialErrorClass.expired(key));
    }

    return ok(result.value);
  }

  async set(
    key: string,
    value: string,
    options: SetOptions = {},
  ): Promise<Result<void, CredentialError>> {
    const keyValidation = validateKey(key);
    if (keyValidation.isErr()) return err(keyValidation.error);
    const valueValidation = validateValue(value);
    if (valueValidation.isErr()) return err(valueValidation.error);

    return await this.writeLock.runExclusive(async () => {
      log.debug({ key, hasExpiry: options.expiresAt !== undefined }, 'set credential');

      await this.backupCurrent(key);

      const write = await this.keychain.set(key, value);
      if (write.isErr()) return err(write.error);

      const now = Date.now();
      const existing = await this.readMeta(key);
      const createdAt = existing.isOk() ? existing.value.createdAt : now;
      const meta: CredentialMeta = {
        key,
        createdAt,
        updatedAt: now,
        ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }),
        tags: Object.freeze([...(options.tags ?? [])]),
      };
      await this.writeMeta(key, meta);
      return ok(undefined);
    });
  }

  async delete(key: string): Promise<Result<void, CredentialError>> {
    const validation = validateKey(key);
    if (validation.isErr()) return err(validation.error);

    return await this.writeLock.runExclusive(() => this.deleteInternal(key));
  }

  /**
   * Rotaciona o valor da credencial e (opcionalmente) atualiza expiry/tags
   * na meta da MESMA key.
   *
   * Antes: `rotate(key, value)` só trocava o valor + tocava `updatedAt`.
   * O `expiresAt` antigo persistia, então o próximo `scanOnce` do
   * `RotationOrchestrator` lia meta vencida e re-disparava o handler em
   * loop infinito (custo OAuth + rate-limit).
   *
   * Agora aceita `SetOptions` igual ao `set`: o caller passa o novo
   * `expiresAt` e a meta da key é atualizada num único call. Isso fecha
   * o loop de rotação sem precisar de chave paralela `<key>.expires_at`.
   */
  async rotate(
    key: string,
    newValue: string,
    options: SetOptions = {},
  ): Promise<Result<void, CredentialError>> {
    const keyValidation = validateKey(key);
    if (keyValidation.isErr()) return err(keyValidation.error);
    const valueValidation = validateValue(newValue);
    if (valueValidation.isErr()) return err(valueValidation.error);

    return await this.writeLock.runExclusive(async () => {
      log.info({ key, hasExpiry: options.expiresAt !== undefined }, 'rotate credential');
      await this.backupCurrent(key);

      const write = await this.keychain.set(key, newValue);
      if (write.isErr()) return err(write.error);

      const now = Date.now();
      const existing = await this.readMeta(key);
      const createdAt = existing.isOk() ? existing.value.createdAt : now;
      const tags = options.tags ?? (existing.isOk() ? [...existing.value.tags] : []);
      const meta: CredentialMeta = {
        key,
        createdAt,
        updatedAt: now,
        ...(options.expiresAt === undefined ? {} : { expiresAt: options.expiresAt }),
        tags: Object.freeze([...tags]),
      };
      await this.writeMeta(key, meta);
      return ok(undefined);
    });
  }

  async list(): Promise<Result<readonly CredentialMeta[], CredentialError>> {
    const keys = await this.keychain.list();
    if (keys.isErr()) return err(keys.error);

    const visible = keys.value.filter(
      (k) => !k.includes(BACKUP_SEPARATOR) && !k.endsWith(META_SUFFIX),
    );
    const metas: CredentialMeta[] = [];
    for (const k of visible) {
      const meta = await this.readMeta(k);
      if (meta.isOk()) metas.push(meta.value);
      else
        metas.push({
          key: k,
          createdAt: 0,
          updatedAt: 0,
          tags: [],
        });
    }
    return ok(metas);
  }

  async exists(key: string): Promise<boolean> {
    const validation = validateKey(key);
    if (validation.isErr()) return false;
    const result = await this.keychain.get(key);
    return result.isOk();
  }

  private async deleteInternal(key: string): Promise<Result<void, CredentialError>> {
    log.debug({ key }, 'delete credential');
    await this.backupCurrent(key);

    const removed = await this.keychain.delete(key);
    if (removed.isErr()) return err(removed.error);

    await this.keychain.delete(metaKey(key));
    return ok(undefined);
  }

  private async backupCurrent(key: string): Promise<void> {
    const current = await this.keychain.get(key);
    if (current.isErr()) return;

    const backupName = `${key}${BACKUP_SEPARATOR}${Date.now()}`;
    await this.keychain.set(backupName, current.value);

    const all = await this.keychain.list();
    if (all.isErr()) return;

    const prefix = `${key}${BACKUP_SEPARATOR}`;
    const backups = all.value
      .filter((k) => k.startsWith(prefix))
      .sort((a, b) => timestampOf(b, prefix) - timestampOf(a, prefix));

    for (const stale of backups.slice(BACKUP_RETENTION)) {
      await this.keychain.delete(stale);
    }
  }

  private async readMeta(key: string): Promise<Result<CredentialMeta, CredentialError>> {
    const raw = await this.keychain.get(metaKey(key));
    if (raw.isErr()) return err(raw.error);
    try {
      return ok(JSON.parse(raw.value) as CredentialMeta);
    } catch (cause) {
      return err(CredentialErrorClass.decryptFailed(metaKey(key), cause));
    }
  }

  private async writeMeta(key: string, meta: CredentialMeta): Promise<void> {
    await this.keychain.set(metaKey(key), JSON.stringify(meta));
  }
}

function metaKey(key: string): string {
  return `${key}${META_SUFFIX}`;
}

function timestampOf(name: string, prefix: string): number {
  const tail = name.slice(prefix.length);
  const ts = Number.parseInt(tail, 10);
  return Number.isFinite(ts) ? ts : 0;
}

function validateKey(key: string): Result<void, CredentialError> {
  if (!KEY_PATTERN.test(key) || key.length > KEY_MAX_LENGTH) {
    return err(CredentialErrorClass.invalidKey(key));
  }
  return ok(undefined);
}

function validateValue(value: string): Result<void, CredentialError> {
  if (value.length === 0 || value.length > VALUE_MAX_LENGTH) {
    return err(CredentialErrorClass.invalidKey('value'));
  }
  return ok(undefined);
}
