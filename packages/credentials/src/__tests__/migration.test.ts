import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InMemoryKeychain } from '../backends/index.ts';
import { migrateV1ToV2 } from '../migration/index.ts';
import { CredentialVault } from '../vault.ts';

const MASTER_KEY = 'test-master-key';

async function writeV1Blob(filePath: string, plaintext: object): Promise<void> {
  const iv = randomBytes(16);
  const salt = randomBytes(16);
  const key = pbkdf2Sync(MASTER_KEY, salt, 100_000, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(plaintext), 'utf-8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  await writeFile(filePath, Buffer.concat([iv, salt, encrypted, tag]));
}

describe('migrateV1ToV2', () => {
  let dir: string;
  let v1Path: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'cred-mig-'));
    v1Path = join(dir, 'credentials.enc');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reports zero found when v1 file missing', async () => {
    const vault = new CredentialVault(new InMemoryKeychain());
    const report = await migrateV1ToV2({
      vault,
      masterKey: MASTER_KEY,
      v1Path: join(dir, 'nope.enc'),
    });
    expect(report).toMatchObject({ found: 0, migrated: 0, failed: 0 });
  });

  it('dry-run does not mutate the vault', async () => {
    await writeV1Blob(v1Path, { 'openai.key': { value: 'sk-abc' } });
    const vault = new CredentialVault(new InMemoryKeychain());

    const report = await migrateV1ToV2({
      vault,
      masterKey: MASTER_KEY,
      v1Path,
      dryRun: true,
    });

    expect(report.found).toBe(1);
    expect(report.migrated).toBe(1);
    expect(await vault.exists('openai.key')).toBe(false);
  });

  it('is idempotent across reruns', async () => {
    await writeV1Blob(v1Path, { 'openai.key': { value: 'sk-abc' } });
    const vault = new CredentialVault(new InMemoryKeychain());

    const first = await migrateV1ToV2({ vault, masterKey: MASTER_KEY, v1Path });
    const second = await migrateV1ToV2({ vault, masterKey: MASTER_KEY, v1Path });

    expect(first.migrated).toBe(1);
    expect(second.migrated).toBe(0);
    expect(second.skipped).toBe(1);
  });

  it('migrates refresh tokens as <key>.refresh_token', async () => {
    await writeV1Blob(v1Path, {
      'oauth.google': { value: 'access-1', refreshToken: 'refresh-1' },
    });
    const vault = new CredentialVault(new InMemoryKeychain());

    const report = await migrateV1ToV2({ vault, masterKey: MASTER_KEY, v1Path });
    expect(report.migrated).toBe(1);

    const refresh = await vault.get('oauth.google.refresh_token');
    expect(refresh.isOk()).toBe(true);
    if (refresh.isOk()) expect(refresh.value).toBe('refresh-1');
  });

  it('handles 50 credentials with 100% success', async () => {
    const blob: Record<string, { value: string }> = {};
    for (let i = 0; i < 50; i++) blob[`key.${i}`] = { value: `v-${i}` };
    await writeV1Blob(v1Path, blob);

    const vault = new CredentialVault(new InMemoryKeychain());
    const report = await migrateV1ToV2({ vault, masterKey: MASTER_KEY, v1Path });

    expect(report.found).toBe(50);
    expect(report.migrated).toBe(50);
    expect(report.failed).toBe(0);
  });
});
