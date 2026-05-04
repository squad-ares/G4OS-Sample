import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectV1Install } from '../v1-detector.ts';

describe('detectV1Install', () => {
  let sandbox: string;

  beforeEach(async () => {
    sandbox = join(tmpdir(), `g4os-migration-test-${Date.now()}-${Math.random()}`);
    await mkdir(sandbox, { recursive: true });
  });

  afterEach(async () => {
    await rm(sandbox, { recursive: true, force: true }).catch(() => undefined);
  });

  it('returns null when no candidate dir exists', async () => {
    const result = await detectV1Install(sandbox);
    expect(result).toBeNull();
  });

  it('returns null when candidate dir exists but config.json is missing', async () => {
    await mkdir(join(sandbox, '.g4os'), { recursive: true });
    const result = await detectV1Install(sandbox);
    expect(result).toBeNull();
  });

  it('detects .g4os install (internal flavor)', async () => {
    const installPath = join(sandbox, '.g4os');
    await mkdir(installPath, { recursive: true });
    await writeFile(join(installPath, 'config.json'), JSON.stringify({ version: '0.1.0' }));

    const result = await detectV1Install(sandbox);
    expect(result).not.toBeNull();
    expect(result?.path).toBe(installPath);
    expect(result?.version).toBe('0.1.0');
    expect(result?.flavor).toBe('internal');
  });

  it('detects .g4os-public install (public flavor)', async () => {
    const installPath = join(sandbox, '.g4os-public');
    await mkdir(installPath, { recursive: true });
    await writeFile(join(installPath, 'config.json'), JSON.stringify({ version: '0.2.0' }));

    const result = await detectV1Install(sandbox);
    expect(result?.flavor).toBe('public');
    expect(result?.version).toBe('0.2.0');
  });

  it('returns null version when config.json is malformed', async () => {
    const installPath = join(sandbox, '.g4os');
    await mkdir(installPath, { recursive: true });
    await writeFile(join(installPath, 'config.json'), 'not-json');

    const result = await detectV1Install(sandbox);
    expect(result).not.toBeNull();
    expect(result?.version).toBeNull();
  });

  it('returns null version when version field is missing', async () => {
    const installPath = join(sandbox, '.g4os');
    await mkdir(installPath, { recursive: true });
    await writeFile(join(installPath, 'config.json'), JSON.stringify({ theme: 'dark' }));

    const result = await detectV1Install(sandbox);
    expect(result?.version).toBeNull();
  });

  it('prefers .g4os over .g4os-public when both exist', async () => {
    for (const dir of ['.g4os', '.g4os-public']) {
      const p = join(sandbox, dir);
      await mkdir(p, { recursive: true });
      await writeFile(join(p, 'config.json'), JSON.stringify({ version: dir }));
    }
    const result = await detectV1Install(sandbox);
    expect(result?.flavor).toBe('internal');
  });
});
