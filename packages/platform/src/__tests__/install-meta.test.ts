import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type InstallMeta,
  loadInstallMeta,
  sha256OfFile,
  verifyRuntimeHashes,
} from '../install-meta.ts';

describe('loadInstallMeta', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'install-meta-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('returns meta_missing when install-meta.json does not exist', async () => {
    const result = await loadInstallMeta({ resourcesPath: dir });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe('meta_missing');
    }
  });

  it('returns meta_corrupt when JSON is malformed', async () => {
    await writeFile(join(dir, 'install-meta.json'), '{ not valid json', 'utf-8');
    const result = await loadInstallMeta({ resourcesPath: dir });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe('meta_corrupt');
    }
  });

  it('returns meta_corrupt when schema does not match', async () => {
    await writeFile(
      join(dir, 'install-meta.json'),
      JSON.stringify({ schemaVersion: 999, foo: 'bar' }),
      'utf-8',
    );
    const result = await loadInstallMeta({ resourcesPath: dir });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe('meta_corrupt');
    }
  });

  it('returns ok with parsed meta when file is valid', async () => {
    const meta: InstallMeta = {
      schemaVersion: 1,
      flavor: 'stable',
      appVersion: '1.0.0',
      builtAt: '2026-04-29T00:00:00.000Z',
      target: 'darwin-arm64',
      runtimes: {
        node: {
          version: '24.10.0',
          sha256: 'a'.repeat(64),
          binaryRelativePath: 'bin/node',
        },
      },
    };
    await writeFile(join(dir, 'install-meta.json'), JSON.stringify(meta), 'utf-8');

    const result = await loadInstallMeta({ resourcesPath: dir });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.meta.appVersion).toBe('1.0.0');
      expect(result.meta.flavor).toBe('stable');
      expect(result.meta.runtimes['node']?.sha256).toBe('a'.repeat(64));
    }
  });

  it('returns app_version_mismatch when versions diverge', async () => {
    const meta: InstallMeta = {
      schemaVersion: 1,
      flavor: 'stable',
      appVersion: '1.0.0',
      builtAt: '2026-04-29T00:00:00.000Z',
      target: 'darwin-arm64',
      runtimes: {},
    };
    await writeFile(join(dir, 'install-meta.json'), JSON.stringify(meta), 'utf-8');

    const result = await loadInstallMeta({ resourcesPath: dir, appVersion: '2.0.0' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe('app_version_mismatch');
      if (result.failure.code === 'app_version_mismatch') {
        expect(result.failure.expected).toBe('1.0.0');
        expect(result.failure.actual).toBe('2.0.0');
      }
    }
  });

  it('passes when appVersion matches', async () => {
    const meta: InstallMeta = {
      schemaVersion: 1,
      flavor: 'beta',
      appVersion: '1.0.0',
      builtAt: '2026-04-29T00:00:00.000Z',
      target: 'win32-x64',
      runtimes: {},
    };
    await writeFile(join(dir, 'install-meta.json'), JSON.stringify(meta), 'utf-8');

    const result = await loadInstallMeta({ resourcesPath: dir, appVersion: '1.0.0' });
    expect(result.ok).toBe(true);
  });
});

describe('sha256OfFile', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'sha256-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('computes consistent SHA-256 for the same content', async () => {
    const path = join(dir, 'sample.txt');
    await writeFile(path, 'hello world', 'utf-8');
    const a = await sha256OfFile(path);
    const b = await sha256OfFile(path);
    expect(a).toBe(b);
    // SHA-256 de "hello world" é determinístico (well-known).
    expect(a).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('produces different hashes for different content', async () => {
    const a = join(dir, 'a.txt');
    const b = join(dir, 'b.txt');
    await writeFile(a, 'foo', 'utf-8');
    await writeFile(b, 'bar', 'utf-8');
    expect(await sha256OfFile(a)).not.toBe(await sha256OfFile(b));
  });
});

describe('verifyRuntimeHashes', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'verify-runtime-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reports runtime_missing when binary path does not exist', async () => {
    const meta: InstallMeta = {
      schemaVersion: 1,
      flavor: 'stable',
      appVersion: '1.0.0',
      builtAt: '2026-04-29T00:00:00.000Z',
      target: 'darwin-arm64',
      runtimes: {
        node: {
          version: '24.10.0',
          sha256: 'a'.repeat(64),
          binaryRelativePath: 'bin/node',
        },
      },
    };
    const result = await verifyRuntimeHashes({ meta, vendorDir: dir });
    expect(result.ok).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.code).toBe('runtime_missing');
  });

  it('reports hash_mismatch when binary differs from manifest', async () => {
    const binaryDir = join(dir, 'node');
    await writeFile(join(dir, 'node-bin'), 'fake binary', 'utf-8');
    // Cria o path esperado pelo manifest.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(binaryDir, { recursive: true });
    await writeFile(join(binaryDir, 'node'), 'fake binary', 'utf-8');

    const meta: InstallMeta = {
      schemaVersion: 1,
      flavor: 'stable',
      appVersion: '1.0.0',
      builtAt: '2026-04-29T00:00:00.000Z',
      target: 'darwin-arm64',
      runtimes: {
        node: {
          version: '24.10.0',
          sha256: '0'.repeat(64), // hash propositalmente errado
          binaryRelativePath: 'node',
        },
      },
    };
    const result = await verifyRuntimeHashes({ meta, vendorDir: dir });
    expect(result.ok).toBe(false);
    expect(result.failures[0]?.code).toBe('hash_mismatch');
  });

  it('returns ok when binary hash matches', async () => {
    const { mkdir } = await import('node:fs/promises');
    const binaryDir = join(dir, 'node');
    await mkdir(binaryDir, { recursive: true });
    const binaryPath = join(binaryDir, 'node');
    await writeFile(binaryPath, 'fake binary', 'utf-8');
    const realHash = await sha256OfFile(binaryPath);

    const meta: InstallMeta = {
      schemaVersion: 1,
      flavor: 'stable',
      appVersion: '1.0.0',
      builtAt: '2026-04-29T00:00:00.000Z',
      target: 'darwin-arm64',
      runtimes: {
        node: {
          version: '24.10.0',
          sha256: realHash,
          binaryRelativePath: 'node',
        },
      },
    };
    const result = await verifyRuntimeHashes({ meta, vendorDir: dir });
    expect(result.ok).toBe(true);
    expect(result.failures).toHaveLength(0);
  });
});
