import { createHash } from 'node:crypto';
import type { CredentialVault } from '@g4os/credentials';
import { createLogger } from '@g4os/kernel/logger';
import type { SourceConfigView } from '@g4os/kernel/types';
import type { SourcesStore } from '@g4os/sources/store';

const log = createLogger('source-secrets');

type SecretBucket = 'env' | 'headers';

interface SecretRefs {
  readonly env?: Record<string, string>;
  readonly headers?: Record<string, string>;
}

interface ConfigWithSecretRefs extends Record<string, unknown> {
  readonly credentialRefs?: SecretRefs;
  readonly secretEnvKeys?: readonly string[];
  readonly secretHeaderKeys?: readonly string[];
}

export interface SecureSourceConfigInput {
  readonly workspaceId: string;
  readonly slug: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly vault?: CredentialVault | undefined;
}

export interface SecureSourceConfigResult {
  readonly config: Readonly<Record<string, unknown>>;
  readonly wroteSecrets: boolean;
}

export async function secureSourceConfigSecrets(
  input: SecureSourceConfigInput,
): Promise<SecureSourceConfigResult> {
  let next: Record<string, unknown> = { ...input.config };
  let wroteSecrets = false;
  for (const bucket of ['env', 'headers'] as const) {
    const secured = await secureBucket(input, next, bucket);
    next = secured.config;
    wroteSecrets = wroteSecrets || secured.wroteSecrets;
  }
  return { config: next, wroteSecrets };
}

export async function hydrateSourceSecrets(
  source: SourceConfigView,
  vault?: CredentialVault,
): Promise<SourceConfigView> {
  if (!vault) return source;

  const refs = readCredentialRefs(source.config);
  if (!refs.env && !refs.headers) return source;

  const config: Record<string, unknown> = { ...source.config };
  await hydrateBucket(config, refs, 'env', vault, source.slug);
  await hydrateBucket(config, refs, 'headers', vault, source.slug);
  return { ...source, config };
}

export async function migrateStoredSourceSecrets(input: {
  readonly store: SourcesStore;
  readonly vault?: CredentialVault | undefined;
  readonly source: SourceConfigView;
}): Promise<SourceConfigView> {
  const secured = await secureSourceConfigSecrets({
    workspaceId: input.source.workspaceId,
    slug: input.source.slug,
    config: input.source.config,
    vault: input.vault,
  });
  if (!secured.wroteSecrets) return input.source;

  const updated = await input.store.update(input.source.workspaceId, input.source.id, {
    config: secured.config,
  });
  return updated ?? { ...input.source, config: secured.config };
}

export async function deleteSourceSecrets(source: SourceConfigView, vault?: CredentialVault) {
  if (!vault) return;
  const refs = readCredentialRefs(source.config);
  const keys = [...Object.values(refs.env ?? {}), ...Object.values(refs.headers ?? {})];
  for (const key of keys) {
    const deleted = await vault.delete(key);
    if (deleted.isErr()) {
      log.warn(
        { key, slug: source.slug, err: deleted.error.message },
        'source secret delete failed',
      );
    }
  }
}

async function secureBucket(
  input: SecureSourceConfigInput,
  current: Record<string, unknown>,
  bucket: SecretBucket,
): Promise<SecureSourceConfigResult> {
  const values = readStringRecord(current[bucket]);
  const entries = Object.entries(values).filter(([, value]) => value.length > 0);
  if (entries.length === 0) return { config: current, wroteSecrets: false };
  if (!input.vault) {
    throw new Error(`CredentialVault required to persist ${bucket} for source ${input.slug}`);
  }

  const credentialRefs = { ...readCredentialRefs(current) };
  const bucketRefs: Record<string, string> = { ...(credentialRefs[bucket] ?? {}) };
  for (const [name, value] of entries) {
    const key = sourceSecretKey(input.workspaceId, input.slug, bucket, name);
    const stored = await input.vault.set(key, value, {
      tags: ['source', input.workspaceId, input.slug, bucket],
    });
    if (stored.isErr()) {
      throw new Error(`Failed to persist ${bucket}.${name} for source ${input.slug}`);
    }
    bucketRefs[name] = key;
  }

  const publicValues = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value.length === 0),
  );
  const nextRefs: SecretRefs = { ...credentialRefs, [bucket]: bucketRefs };
  return {
    config: {
      ...current,
      [bucket]: publicValues,
      credentialRefs: nextRefs,
      ...(bucket === 'env'
        ? { secretEnvKeys: Object.keys(bucketRefs) }
        : { secretHeaderKeys: Object.keys(bucketRefs) }),
    },
    wroteSecrets: true,
  };
}

async function hydrateBucket(
  config: Record<string, unknown>,
  refs: SecretRefs,
  bucket: SecretBucket,
  vault: CredentialVault,
  slug: string,
) {
  const bucketRefs = refs[bucket];
  if (!bucketRefs) return;

  const restored: Record<string, string> = { ...readStringRecord(config[bucket]) };
  for (const [name, key] of Object.entries(bucketRefs)) {
    const value = await vault.get(key);
    if (value.isOk()) {
      restored[name] = value.value;
    } else {
      log.warn({ key, slug, err: value.error.message }, 'source secret hydrate failed');
    }
  }
  config[bucket] = restored;
}

function readCredentialRefs(config: Readonly<Record<string, unknown>>): SecretRefs {
  const raw = (config as ConfigWithSecretRefs).credentialRefs;
  if (!raw || typeof raw !== 'object') return {};
  return {
    ...(raw.env ? { env: readStringRecord(raw.env) } : {}),
    ...(raw.headers ? { headers: readStringRecord(raw.headers) } : {}),
  };
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') out[key] = raw;
  }
  return out;
}

function sourceSecretKey(
  workspaceId: string,
  slug: string,
  bucket: SecretBucket,
  name: string,
): string {
  const digest = createHash('sha256')
    .update(`${workspaceId}:${slug}:${bucket}:${name}`)
    .digest('hex')
    .slice(0, 48);
  return `source.${digest}`;
}
