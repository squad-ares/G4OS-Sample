import { describe, expect, it } from 'vitest';
import { InMemoryKeychain } from '../backends/index.ts';
import { CredentialVault } from '../vault.ts';

describe('CredentialVault', () => {
  it('stores and retrieves a credential', async () => {
    const vault = new CredentialVault(new InMemoryKeychain());
    const write = await vault.set('api.key', 'secret-value');
    expect(write.isOk()).toBe(true);

    const read = await vault.get('api.key');
    expect(read.isOk()).toBe(true);
    if (read.isOk()) expect(read.value).toBe('secret-value');
  });

  it('rejects invalid keys', async () => {
    const vault = new CredentialVault(new InMemoryKeychain());
    const write = await vault.set('bad key!', 'x');
    expect(write.isErr()).toBe(true);
  });

  it('returns expired error and auto-deletes', async () => {
    const vault = new CredentialVault(new InMemoryKeychain());
    const expiresAt = Date.now() - 1000;
    const write = await vault.set('token', 'v', { expiresAt });
    expect(write.isOk()).toBe(true);

    const read = await vault.get('token');
    expect(read.isErr()).toBe(true);
    if (read.isErr()) expect(read.error.code).toBe('credential.expired');

    const afterExpire = await vault.get('token');
    expect(afterExpire.isErr()).toBe(true);
  });

  it('serializes concurrent writes without losing data', async () => {
    const vault = new CredentialVault(new InMemoryKeychain());
    const concurrency = 100;

    await Promise.all(
      Array.from({ length: concurrency }, (_, i) => vault.set('shared.key', `v${i}`)),
    );

    const read = await vault.get('shared.key');
    expect(read.isOk()).toBe(true);
    if (read.isOk()) expect(read.value).toMatch(/^v\d+$/);
  });

  it('retains at most 3 backups after rotation', async () => {
    const keychain = new InMemoryKeychain();
    const vault = new CredentialVault(keychain);
    await vault.set('rot', 'v0');
    for (let i = 1; i < 8; i++) {
      await vault.rotate('rot', `v${i}`);
    }

    const keys = await keychain.list();
    expect(keys.isOk()).toBe(true);
    if (!keys.isOk()) return;
    const backups = keys.value.filter((k) => k.startsWith('rot.backup-'));
    expect(backups.length).toBeLessThanOrEqual(3);
  });

  it('lists only visible credentials (no meta or backups)', async () => {
    const vault = new CredentialVault(new InMemoryKeychain());
    await vault.set('a', '1');
    await vault.set('b', '2');
    await vault.rotate('a', '1b');

    const list = await vault.list();
    expect(list.isOk()).toBe(true);
    if (!list.isOk()) return;
    const keys = list.value.map((m) => m.key).sort();
    expect(keys).toEqual(['a', 'b']);
  });

  it('delete removes value and meta', async () => {
    const vault = new CredentialVault(new InMemoryKeychain());
    await vault.set('gone', 'bye');
    const del = await vault.delete('gone');
    expect(del.isOk()).toBe(true);

    const exists = await vault.exists('gone');
    expect(exists).toBe(false);
  });

  // CR12-C3: meta corrompida não deve ser mascarada como entry válido com
  // createdAt=0. `stale: true` sinaliza ao caller que precisa repair.
  it('flags entries with missing meta as stale', async () => {
    const keychain = new InMemoryKeychain();
    const vault = new CredentialVault(keychain);
    await vault.set('healthy', 'v1');
    await vault.set('orphan', 'v2');
    // Apaga só a meta — simula corrupção/write parcial.
    await keychain.delete('orphan.meta');

    const list = await vault.list();
    expect(list.isOk()).toBe(true);
    if (!list.isOk()) return;

    const healthy = list.value.find((m) => m.key === 'healthy');
    const orphan = list.value.find((m) => m.key === 'orphan');
    expect(healthy?.stale).toBeUndefined();
    expect(healthy?.createdAt).toBeGreaterThan(0);
    expect(orphan?.stale).toBe(true);
    expect(orphan?.createdAt).toBe(0);
  });
});
