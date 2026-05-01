import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashArgs, PermissionStore } from '../permission-store.ts';

describe('hashArgs', () => {
  it('returns deterministic 64-char hex for equivalent inputs (order-independent)', () => {
    const a = hashArgs({ path: '/tmp/foo', flag: true });
    const b = hashArgs({ flag: true, path: '/tmp/foo' });
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different values', () => {
    expect(hashArgs({ path: '/tmp/a' })).not.toBe(hashArgs({ path: '/tmp/b' }));
  });

  it('differs for different keys', () => {
    expect(hashArgs({ path: '/tmp/a' })).not.toBe(hashArgs({ file: '/tmp/a' }));
  });

  it('handles nested objects and arrays stably', () => {
    const a = hashArgs({ input: { items: [1, { x: 'a', y: 'b' }] } });
    const b = hashArgs({ input: { items: [1, { y: 'b', x: 'a' }] } });
    expect(a).toBe(b);
  });

  it('rejects circular references with explicit error (CR5-11)', () => {
    const obj: Record<string, unknown> = { name: 'foo' };
    obj['self'] = obj;
    expect(() => hashArgs(obj)).toThrow(/circular reference/);
  });

  it('rejects circular references via array (CR5-11)', () => {
    const arr: unknown[] = [];
    arr.push(arr);
    expect(() => hashArgs({ data: arr })).toThrow(/circular reference/);
  });
});

describe('PermissionStore', () => {
  let root: string;
  let store: PermissionStore;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'g4os-perm-store-'));
    store = new PermissionStore({ resolveWorkspaceRoot: () => root });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns empty list when file is absent', async () => {
    expect(await store.list('ws-1')).toEqual([]);
  });

  it('persists and finds an allow_always decision by (toolName, argsHash)', async () => {
    const args = { path: '/tmp/x' };
    const persisted = await store.persist('ws-1', { toolName: 'read_file', args });
    expect(persisted.toolName).toBe('read_file');
    expect(persisted.argsHash).toBe(hashArgs(args));

    const found = await store.find('ws-1', 'read_file', args);
    expect(found?.argsHash).toBe(persisted.argsHash);
  });

  it('find misses when args differ', async () => {
    await store.persist('ws-1', { toolName: 'run_bash', args: { cmd: 'ls' } });
    expect(await store.find('ws-1', 'run_bash', { cmd: 'rm -rf /' })).toBeNull();
  });

  it('persist replaces existing decision for same match (no duplicates)', async () => {
    const args = { path: '/tmp/x' };
    await store.persist('ws-1', { toolName: 'read_file', args });
    await store.persist('ws-1', { toolName: 'read_file', args });
    expect(await store.list('ws-1')).toHaveLength(1);
  });

  it('revoke removes the decision', async () => {
    const args = { path: '/tmp/x' };
    const d = await store.persist('ws-1', { toolName: 'read_file', args });
    const revoked = await store.revoke('ws-1', d.toolName, d.argsHash);
    expect(revoked).toBe(true);
    expect(await store.find('ws-1', 'read_file', args)).toBeNull();
  });

  it('clearAll wipes decisions for a workspace and returns the count', async () => {
    await store.persist('ws-1', { toolName: 'read_file', args: { p: '/a' } });
    await store.persist('ws-1', { toolName: 'read_file', args: { p: '/b' } });
    expect(await store.clearAll('ws-1')).toBe(2);
    expect(await store.list('ws-1')).toEqual([]);
  });

  it('accepts legacy 32-char argsHash on find (backward-compatible read)', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const args = { path: '/legacy' };
    const full = hashArgs(args);
    const legacy = full.slice(0, 32);
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, 'permissions.json'),
      JSON.stringify({
        version: 1,
        decisions: [{ toolName: 'read_file', argsHash: legacy, argsPreview: '{}', decidedAt: 1 }],
      }),
      'utf8',
    );
    const found = await store.find('ws-1', 'read_file', args);
    expect(found?.argsHash).toBe(legacy);
  });

  it('persist removes legacy 32-char hash when writing full 64-char (CR5-24)', async () => {
    const { writeFile, mkdir } = await import('node:fs/promises');
    const args = { path: '/legacy-cleanup' };
    const full = hashArgs(args);
    const legacy = full.slice(0, 32);
    await mkdir(root, { recursive: true });
    await writeFile(
      join(root, 'permissions.json'),
      JSON.stringify({
        version: 1,
        decisions: [{ toolName: 'read_file', argsHash: legacy, argsPreview: '{}', decidedAt: 1 }],
      }),
      'utf8',
    );
    await store.persist('ws-1', { toolName: 'read_file', args });
    const list = await store.list('ws-1');
    // Single entry, com hash full (64-char). Legacy 32-char foi descartada.
    expect(list).toHaveLength(1);
    const first = list[0];
    expect(first?.argsHash).toBe(full);
    expect(first?.argsHash).toHaveLength(64);
  });

  it('withLock times out fn that hangs longer than lockTimeoutMs (CR5-23)', async () => {
    const tightStore = new PermissionStore({
      resolveWorkspaceRoot: () => root,
      lockTimeoutMs: 50,
    });
    // Sequencia operações: primeira hung, segunda fica behind do lock e
    // expecta timeout vindo do mesmo workspace queue.
    const hung = (
      tightStore as unknown as {
        withLock: (ws: string, fn: () => Promise<unknown>) => Promise<unknown>;
      }
    ).withLock('ws-1', () => new Promise(() => undefined));
    await expect(hung).rejects.toThrow(/lock timeout/);
  });

  // CR-18 F-PE2: argsPreview persistido no JSON nunca pode conter segredo
  // em texto plano — viola o gateway único do CredentialVault (ADR-0050).
  describe('previewArgs redaction (F-PE2)', () => {
    it('redacts values keyed as sensitive identifiers', async () => {
      const store = new PermissionStore({ resolveWorkspaceRoot: () => root });
      await store.persist('ws-1', {
        toolName: 'gmail.send',
        args: { to: 'foo@example.com', apiKey: 'sk-real-secret-1234567890' },
      });
      const list = await store.list('ws-1');
      expect(list[0]?.argsPreview).toContain('"apiKey":"[REDACTED]"');
      expect(list[0]?.argsPreview).not.toContain('sk-real-secret-1234567890');
      // E-mail não-sensível continua presente para auditoria.
      expect(list[0]?.argsPreview).toContain('foo@example.com');
    });

    it('redacts values matching token shape even under benign keys', async () => {
      const store = new PermissionStore({ resolveWorkspaceRoot: () => root });
      await store.persist('ws-1', {
        toolName: 'run_bash',
        args: {
          cmd: "curl -H 'Authorization: Bearer ghp_AAAAAAAAAAAAAAAAAAAAAAAAAA' https://api.github.com/user",
        },
      });
      const list = await store.list('ws-1');
      expect(list[0]?.argsPreview).not.toContain('ghp_AAAAAAAAAAAAAAAAAAAAAAAAAA');
      expect(list[0]?.argsPreview).toContain('[REDACTED]');
    });

    it('handles nested objects without leaking', async () => {
      const store = new PermissionStore({ resolveWorkspaceRoot: () => root });
      await store.persist('ws-1', {
        toolName: 'oauth.exchange',
        args: { provider: 'github', credentials: { access_token: 'sk-leak-1234567890abcdef' } },
      });
      const list = await store.list('ws-1');
      expect(list[0]?.argsPreview).not.toContain('sk-leak-1234567890abcdef');
      expect(list[0]?.argsPreview).toContain('[REDACTED]');
      expect(list[0]?.argsPreview).toContain('github');
    });
  });
});
