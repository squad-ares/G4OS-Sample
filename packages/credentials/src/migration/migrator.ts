/**
 * Migrator v1 → v2. Lê `credentials.enc` antigo e popula o `CredentialVault`
 * atual respeitando três invariantes:
 *
 *   1. Idempotente — chaves já presentes na v2 não são sobrescritas.
 *   2. Não-destrutiva — nunca apaga o arquivo v1; usuário decide depois.
 *   3. Tolerante — falha em uma credencial não aborta as demais.
 *
 * Keys da v1 que violam o `KEY_PATTERN` do vault (`/^[a-z0-9._-]+$/i`) são
 * sanitizadas (chars inválidos viram `_`). Tokens de renovação OAuth
 * associados são migrados como `<key>.refresh_token`.
 */

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createLogger } from '@g4os/kernel/logger';
import type { CredentialVault } from '../vault.ts';
import { readV1Credentials, type V1Credentials } from './v1-reader.ts';

const log = createLogger('credentials-migration');

const KEY_SAFE_PATTERN = /[^a-z0-9._-]/gi;
const KEY_MAX_LENGTH = 100;

export interface MigrateOptions {
  readonly vault: CredentialVault;
  readonly masterKey: string;
  readonly v1Path?: string;
  readonly dryRun?: boolean;
  /**
   * Quando informado, persiste o `MigrationReport` final como JSON neste path
   * para auditoria pós-execução. Útil quando usuário reporta key
   * faltando — operador consulta arquivo persistido em vez de log volátil.
   * Default: não persiste.
   */
  readonly reportPath?: string;
}

export interface MigrationReport {
  readonly found: number;
  readonly migrated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly errors: readonly string[];
}

type EntryOutcome =
  | { readonly kind: 'migrated' }
  | { readonly kind: 'skipped' }
  | { readonly kind: 'failed'; readonly errors: readonly string[] };

export async function migrateV1ToV2(options: MigrateOptions): Promise<MigrationReport> {
  const v1Path = options.v1Path ?? defaultV1Path();

  if (!existsSync(v1Path)) {
    log.info({ v1Path }, 'no v1 credentials file — skipping migration');
    return emptyReport();
  }

  let v1Creds: V1Credentials;
  try {
    v1Creds = await readV1Credentials(v1Path, options.masterKey);
  } catch (cause) {
    log.error({ err: cause }, 'failed to read v1 credentials');
    return { ...emptyReport(), errors: [describeError('read-v1', cause)] };
  }

  const entries = Object.entries(v1Creds);
  log.info({ count: entries.length, dryRun: options.dryRun === true }, 'starting migration');

  let migrated = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  // Detecta colisão de chave sanitizada antes de gravar. Sem isso,
  // se duas chaves v1 (`openai-api-key` e `openai_api_key`) convergem para
  // o mesmo target (`openai_api_key`), a segunda escrita sobrescreve a
  // primeira silenciosamente (data loss em momento crítico — migração).
  // Também rastreia chave secundária `<key>.refresh_token` —
  // duas chaves v1 que colidem no primário também colidem no `.refresh_token`,
  // causando perda de OAuth tokens.
  const targetMap = new Map<string, string>(); // target → first rawKey que claimed
  for (const [rawKey, v1] of entries) {
    const primaryTarget = sanitizeKey(rawKey);
    const refreshTarget = sanitizeKey(`${rawKey}.refresh_token`);

    const primaryClaimedBy = targetMap.get(primaryTarget);
    const refreshClaimedBy = targetMap.get(refreshTarget);

    if (primaryClaimedBy && primaryClaimedBy !== rawKey) {
      const msg = `${rawKey}: target key "${primaryTarget}" already claimed by "${primaryClaimedBy}" (collision after sanitization)`;
      log.error(
        { rawKey, target: primaryTarget, claimedBy: primaryClaimedBy },
        'sanitized key collision',
      );
      errors.push(msg);
      failed++;
      continue;
    }
    if (refreshClaimedBy && refreshClaimedBy !== rawKey) {
      const msg = `${rawKey}: refresh-token target "${refreshTarget}" already claimed by "${refreshClaimedBy}" (collision after sanitization)`;
      log.error(
        { rawKey, target: refreshTarget, claimedBy: refreshClaimedBy },
        'sanitized refresh-token key collision',
      );
      errors.push(msg);
      failed++;
      continue;
    }
    targetMap.set(primaryTarget, rawKey);
    targetMap.set(refreshTarget, rawKey);

    const outcome = await migrateEntry(rawKey, v1, options);
    if (outcome.kind === 'migrated') migrated++;
    else if (outcome.kind === 'skipped') skipped++;
    else {
      failed++;
      errors.push(...outcome.errors);
    }
  }

  log.info({ found: entries.length, migrated, skipped, failed }, 'migration complete');
  const report: MigrationReport = { found: entries.length, migrated, skipped, failed, errors };

  // Persiste relatório como JSON quando reportPath foi informado.
  // Operador consulta arquivo em "user reportou key X faltando" sem
  // depender de log volátil.
  if (options.reportPath) {
    try {
      await mkdir(dirname(options.reportPath), { recursive: true });
      await writeFile(
        options.reportPath,
        `${JSON.stringify({ ...report, completedAt: new Date().toISOString() }, null, 2)}\n`,
        'utf-8',
      );
    } catch (err) {
      log.warn({ err, reportPath: options.reportPath }, 'failed to persist migration report');
    }
  }

  return report;
}

async function migrateEntry(
  rawKey: string,
  v1: V1Credentials[string],
  options: MigrateOptions,
): Promise<EntryOutcome> {
  const key = sanitizeKey(rawKey);

  try {
    if (await options.vault.exists(key)) {
      log.debug({ key }, 'already in v2 — skipping');
      return { kind: 'skipped' };
    }

    if (options.dryRun === true) {
      log.debug({ key }, 'would migrate');
      return { kind: 'migrated' };
    }

    const write = await options.vault.set(key, v1.value, { tags: ['migrated-from-v1'] });
    if (write.isErr()) {
      return { kind: 'failed', errors: [`${key}: ${write.error.message}`] };
    }

    const refreshError = await migrateRefreshToken(rawKey, v1, options);
    const errors = refreshError === null ? [] : [refreshError];
    // Refresh failure is non-fatal — primary write succeeded.
    if (errors.length > 0) log.warn({ key, errors }, 'refresh token migration warning');

    return { kind: 'migrated' };
  } catch (cause) {
    return { kind: 'failed', errors: [describeError(key, cause)] };
  }
}

async function migrateRefreshToken(
  rawKey: string,
  v1: V1Credentials[string],
  options: MigrateOptions,
): Promise<string | null> {
  if (typeof v1.refreshToken !== 'string' || v1.refreshToken.length === 0) return null;
  const refreshKey = sanitizeKey(`${rawKey}.refresh_token`);
  // Refresh-token check exists ANTES do set. Sem isso, re-run da
  // migração (ex: usuário roda dry-run depois roda real, ou crash no meio
  // forçou retry) sobrescrevia refresh-tokens já rotacionados pelo provider —
  // e como esses tokens são single-use em Supabase/Google, valor antigo
  // virava lixo invalidado, forçando reauth manual.
  if (await options.vault.exists(refreshKey)) {
    return null;
  }
  const write = await options.vault.set(refreshKey, v1.refreshToken, {
    tags: ['migrated-from-v1', 'refresh-token'],
  });
  return write.isErr() ? `${refreshKey}: ${write.error.message}` : null;
}

function defaultV1Path(): string {
  return join(homedir(), '.g4os', 'credentials.enc');
}

function emptyReport(): MigrationReport {
  return { found: 0, migrated: 0, skipped: 0, failed: 0, errors: [] };
}

function sanitizeKey(raw: string): string {
  return raw.replace(KEY_SAFE_PATTERN, '_').slice(0, KEY_MAX_LENGTH);
}

function describeError(key: string, cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  return `${key}: ${message}`;
}
