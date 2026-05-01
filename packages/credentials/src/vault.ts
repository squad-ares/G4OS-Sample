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
import { CredentialMetaSchema } from '@g4os/kernel/schemas';
import type { IKeychain } from '@g4os/platform';
import { Mutex } from 'async-mutex';
import { err, ok } from 'neverthrow';

const log = createLogger('credential-vault');

const META_SUFFIX = '.meta';
const BACKUP_SEPARATOR = '.backup-';
const BACKUP_RETENTION = 3;
// Flag `i` removida — Unicode case folding permitia homoglyph
// attacks (ß ↔ "ss", Cyrillic/Greek lookalikes que casam Latin via folding).
// Sem `i`, o regex força bytes ASCII lowercase explícitos. Caller deve
// normalizar para lowercase ANTES de passar para `set()`/`get()`.
const KEY_PATTERN = /^[a-z0-9._-]+$/;
const KEY_MAX_LENGTH = 100;
const VALUE_MAX_LENGTH = 1_000_000;
// CR-18 F-C4: limites de tags alinhados com `CredentialMetaSchema` em
// `@g4os/kernel/schemas/credential.schema.ts`. Sem essa validação no
// `set`/`rotate`, caller que passe 33 tags grava OK, mas o `readMeta`
// subsequente falha no Zod parse e a entry vira "stale" sem sinal claro.
const MAX_TAGS = 32;
const TAG_MAX_LENGTH = 64;

export interface CredentialMeta {
  readonly key: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly expiresAt?: number;
  readonly tags: readonly string[];
  /**
   * `true` quando o entry existe no keychain mas a metadata está
   * ausente/corrompida. Antes, `list()` mascarava esse caso com placeholder
   * zerado — caller não tinha como distinguir entry novo (createdAt=0) de
   * entry com meta perdida. Consumers que precisam agir só sobre dados
   * confiáveis devem filtrar `stale === true`.
   */
  readonly stale?: boolean;
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
      // Auto-delete via mutex: sem o lock, um `set()` concorrente
      // pode ter escrito o novo valor entre o keychain.get acima e o delete
      // aqui, e a deleção apagaria o valor recém-escrito. O mutex serializa
      // todas as escritas no vault — auto-delete também é escrita.
      await this.writeLock.runExclusive(() => this.deleteInternal(key));
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
    const tagsValidation = validateTags(options.tags);
    if (tagsValidation.isErr()) return err(tagsValidation.error);

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
      // Propagar erro de writeMeta. Se falhar, credencial já foi
      // escrita — log warn explícito + retorna o err para caller decidir
      // se quer retry ou rollback.
      const metaWrite = await this.writeMeta(key, meta);
      if (metaWrite.isErr()) {
        log.warn(
          { key, err: metaWrite.error.message },
          'credential value written but metadata write failed',
        );
        return err(metaWrite.error);
      }
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
    const tagsValidation = validateTags(options.tags);
    if (tagsValidation.isErr()) return err(tagsValidation.error);

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
      // Idem set() — propaga erro de writeMeta.
      const metaWrite = await this.writeMeta(key, meta);
      if (metaWrite.isErr()) {
        log.warn(
          { key, err: metaWrite.error.message },
          'credential rotated but metadata write failed',
        );
        return err(metaWrite.error);
      }
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
      if (meta.isOk()) {
        metas.push(meta.value);
      } else {
        // Meta ausente/corrompida — marcar `stale` em vez de
        // mascarar com placeholder zerado. Operador vê via debug-export
        // ou Settings → Repair que entry tem meta inconsistente.
        log.warn(
          { key: k, err: meta.error.message },
          'credential entry has missing/corrupted metadata; marking stale',
        );
        metas.push({
          key: k,
          createdAt: 0,
          updatedAt: 0,
          tags: [],
          stale: true,
        });
      }
    }
    return ok(metas);
  }

  /**
   * **Informational only** — não usar como gate antes de `set()`.
   *
   * TOCTOU window. Pattern `if (await exists(k)) skip; else set(k)` é
   * inerentemente racy entre processos. Caller que precisa de "set se não
   * existe" deve fazer `set()` direto e tratar o erro de chave duplicada,
   * OU envolver `exists + set` num lock externo (ex.: mutex per-workspace).
   * O migrator v1→v2 usa lookup local (`targetMap`) em vez de exists() pra
   * evitar esse race.
   */
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

    // Se delete da meta falha (disk full, IO error), credencial
    // ficaria órfã com meta apontando pra valor inexistente — `list()`
    // retornaria entries fantasmas. Best-effort: log warn explícito, sem
    // tentar rollback do delete da credencial (que já sucedeu).
    const removedMeta = await this.keychain.delete(metaKey(key));
    if (removedMeta.isErr()) {
      log.warn(
        { key, err: removedMeta.error.message },
        'credential deleted but metadata delete failed; orphan meta entry remains',
      );
    }
    return ok(undefined);
  }

  private async backupCurrent(key: string): Promise<void> {
    const current = await this.keychain.get(key);
    if (current.isErr()) return;

    const backupName = `${key}${BACKUP_SEPARATOR}${Date.now()}`;
    // Logar erro de backup. Em disk-full / safeStorage indisponível
    // o set silenciosamente falhava — próximo `delete()` ou `set()` chama
    // backupCurrent que falha de novo, e usuário fica sem nenhum backup
    // sem visibilidade. Log warn pra operador inspecionar via debug-export.
    const setResult = await this.keychain.set(backupName, current.value);
    if (setResult.isErr()) {
      log.warn(
        { key, backupName, err: setResult.error.message },
        'failed to write credential backup; rotation may be inconsistent',
      );
      return;
    }

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
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.value);
    } catch (cause) {
      // JSON inválido: provavelmente meta corrompida (write parcial, codec
      // mismatch). Mantém `decryptFailed` por compatibilidade com callers
      // que já tratam essa branch.
      return err(CredentialErrorClass.decryptFailed(metaKey(key), cause));
    }
    // Validação Zod separa shape mismatch (versão legacy, schema
    // drift) de corrupção criptográfica. Mesmo error code mas com cause
    // discriminada (`ZodError`) para diagnóstico.
    const result = CredentialMetaSchema.safeParse(parsed);
    if (!result.success) {
      return err(CredentialErrorClass.decryptFailed(metaKey(key), result.error));
    }
    // Cast de volta a CredentialMeta (interface ainda exposta com
    // `readonly tags`); safeParse garante shape, então o cast é seguro.
    return ok(result.data as CredentialMeta);
  }

  private async writeMeta(
    key: string,
    meta: CredentialMeta,
  ): Promise<Result<void, CredentialError>> {
    // Era `async void` — falha em `keychain.set` (disk full,
    // safeStorage indisponível) era silenciada. Caller (`set`/`rotate`)
    // não sabia que credencial OK + meta falhou → vault inconsistente
    // até próximo write.
    return await this.keychain.set(metaKey(key), JSON.stringify(meta));
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

function validateTags(tags: readonly string[] | undefined): Result<void, CredentialError> {
  // CR-18 F-C4: alinhamento com `CredentialMetaSchema` — sem essa guarda,
  // tags excessivas/longas eram aceitas pelo set/rotate mas o readMeta
  // subsequente falhava no Zod parse e a entry virava "stale" sem sinal.
  if (!tags) return ok(undefined);
  if (tags.length > MAX_TAGS) {
    return err(CredentialErrorClass.invalidValue('too_many_tags'));
  }
  for (const tag of tags) {
    if (tag.length === 0 || tag.length > TAG_MAX_LENGTH) {
      return err(CredentialErrorClass.invalidValue('tag_length_out_of_range'));
    }
  }
  return ok(undefined);
}

function validateValue(value: string): Result<void, CredentialError> {
  if (value.length === 0) {
    return err(CredentialErrorClass.invalidValue('empty'));
  }
  if (value.length > VALUE_MAX_LENGTH) {
    return err(CredentialErrorClass.invalidValue('too_long'));
  }
  return ok(undefined);
}
