import type { CredentialVault } from '@g4os/credentials';
import type { SourceConfigView } from '@g4os/kernel/types';
import type { SourcesStore } from '@g4os/sources/store';
import { ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';
import {
  hydrateSourceSecrets,
  migrateStoredSourceSecrets,
  secureSourceConfigSecrets,
} from '../secrets.ts';

function makeVault(): CredentialVault {
  const values = new Map<string, string>();
  return {
    set: vi.fn((key: string, value: string) => {
      values.set(key, value);
      return Promise.resolve(ok(undefined));
    }),
    get: vi.fn((key: string) => Promise.resolve(ok(values.get(key) ?? ''))),
    delete: vi.fn((key: string) => {
      values.delete(key);
      return Promise.resolve(ok(undefined));
    }),
  } as unknown as CredentialVault;
}

function makeSource(config: Readonly<Record<string, unknown>>): SourceConfigView {
  return {
    id: 'src-1',
    workspaceId: 'workspace-1',
    slug: 'local-mcp',
    kind: 'mcp-stdio',
    displayName: 'Local MCP',
    category: 'other',
    authKind: 'none',
    enabled: true,
    status: 'connected',
    config,
    createdAt: 1,
    updatedAt: 1,
  } as SourceConfigView;
}

describe('source secrets', () => {
  it('moves env and header values out of persisted config and rehydrates them for runtime', async () => {
    const vault = makeVault();

    const secured = await secureSourceConfigSecrets({
      workspaceId: 'workspace-1',
      slug: 'local-mcp',
      vault,
      config: {
        command: 'node',
        args: ['server.js'],
        env: { API_KEY: 'secret-token', EMPTY_VALUE: '' },
        headers: { Authorization: 'Bearer secret-token' },
      },
    });

    expect(JSON.stringify(secured.config)).not.toContain('secret-token');
    expect(secured.config).toMatchObject({
      env: { EMPTY_VALUE: '' },
      secretEnvKeys: ['API_KEY'],
      secretHeaderKeys: ['Authorization'],
    });

    const hydrated = await hydrateSourceSecrets(makeSource(secured.config), vault);
    expect(hydrated.config).toMatchObject({
      env: { API_KEY: 'secret-token', EMPTY_VALUE: '' },
      headers: { Authorization: 'Bearer secret-token' },
    });
  });

  it('migrates legacy plain env values through the store update path', async () => {
    const vault = makeVault();
    const source = makeSource({
      command: 'node',
      args: ['server.js'],
      env: { API_KEY: 'legacy-secret' },
    });
    const store = {
      update: vi.fn(async (_workspaceId: string, _id: string, patch: { config?: unknown }) => ({
        ...source,
        config: patch.config as Readonly<Record<string, unknown>>,
      })),
    } as unknown as SourcesStore;

    const migrated = await migrateStoredSourceSecrets({ store, vault, source });

    expect(store.update).toHaveBeenCalledOnce();
    expect(JSON.stringify(migrated.config)).not.toContain('legacy-secret');
    expect(migrated.config).toMatchObject({ secretEnvKeys: ['API_KEY'] });
  });
});
