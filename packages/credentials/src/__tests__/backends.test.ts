import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlaintextCodec, FileKeychain, InMemoryKeychain } from '../backends/index.ts';

describe('InMemoryKeychain', () => {
  it('set/get/delete roundtrip', async () => {
    const kc = new InMemoryKeychain();
    await kc.set('k', 'v');
    const read = await kc.get('k');
    expect(read.isOk() && read.value === 'v').toBe(true);
    await kc.delete('k');
    const miss = await kc.get('k');
    expect(miss.isErr()).toBe(true);
  });

  it('returns not_found for missing key', async () => {
    const kc = new InMemoryKeychain();
    const result = await kc.get('missing');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('credential.not_found');
  });
});

describe('FileKeychain', () => {
  let baseDir: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'file-kc-'));
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('persists encoded secrets to disk and reads them back', async () => {
    const kc = new FileKeychain({ baseDir, codec: createPlaintextCodec() });
    const write = await kc.set('oauth.google', 'token-123');
    expect(write.isOk()).toBe(true);

    const read = await kc.get('oauth.google');
    expect(read.isOk()).toBe(true);
    if (read.isOk()) expect(read.value).toBe('token-123');
  });

  it('list returns stored keys decoded', async () => {
    const kc = new FileKeychain({ baseDir, codec: createPlaintextCodec() });
    await kc.set('a.b', '1');
    await kc.set('c.d', '2');
    const keys = await kc.list();
    expect(keys.isOk()).toBe(true);
    if (keys.isOk()) expect(keys.value.sort()).toEqual(['a.b', 'c.d']);
  });

  it('returns error when codec reports unavailable', async () => {
    const kc = new FileKeychain({
      baseDir,
      codec: {
        available: false,
        encrypt: () => Buffer.from(''),
        decrypt: () => '',
      },
    });
    const result = await kc.set('k', 'v');
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('credential.locked');
  });
});
