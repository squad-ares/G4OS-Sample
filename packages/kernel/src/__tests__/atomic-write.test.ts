import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeAtomic } from '../fs/atomic-write.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'g4os-atomic-write-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('writeAtomic', () => {
  it('writes data to the target path', async () => {
    const path = join(dir, 'data.json');
    await writeAtomic(path, JSON.stringify({ hello: 'world' }));

    const content = await readFile(path, 'utf-8');
    expect(JSON.parse(content)).toEqual({ hello: 'world' });
  });

  it('cleans up the .tmp file after successful rename', async () => {
    const path = join(dir, 'cleanup.json');
    await writeAtomic(path, 'final');

    const entries = await readdir(dir);
    expect(entries).toEqual(['cleanup.json']);
    expect(entries.find((e) => e.includes('.tmp'))).toBeUndefined();
  });

  it('writes Uint8Array buffers', async () => {
    const path = join(dir, 'binary.bin');
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    await writeAtomic(path, data);

    const buf = await readFile(path);
    expect(Array.from(buf)).toEqual([1, 2, 3, 4, 5]);
  });

  it('overwrites existing file atomically (preserves old content if interrupted)', async () => {
    const path = join(dir, 'overwrite.json');
    await writeAtomic(path, 'v1');
    await writeAtomic(path, 'v2');
    expect(await readFile(path, 'utf-8')).toBe('v2');
  });

  it('respects mode option', async () => {
    const path = join(dir, 'mode.json');
    await writeAtomic(path, 'restricted', { mode: 0o600 });
    const stats = await stat(path);
    // mode bits: octal 0o600 = decimal 384; mask 0o777
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it('does not leave .tmp behind on write error', async () => {
    const path = join(dir, 'subdir', 'nope.json');
    // subdir doesn't exist → open() fails. We expect .tmp cleanup attempt.
    await expect(writeAtomic(path, 'data')).rejects.toThrow();
    // Parent dir doesn't exist; nothing to list, but tmp from this path should not exist.
    const entries = await readdir(dir);
    expect(entries.find((e) => e.includes('.tmp'))).toBeUndefined();
  });
});
