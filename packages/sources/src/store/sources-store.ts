/**
 * Persistência de sources por workspace em JSON: `workspaces/{id}/sources.json`.
 *
 * Por que JSON + não SQLite: o catálogo de sources por workspace é pequeno
 * (~20 itens em média) e raramente mutado. SQLite adicionaria migrations sem
 * ganho. Escrita atômica via `write→rename` evita corrupção em crash.
 * Tokens/segredos NUNCA entram aqui — ficam no `CredentialVault` referenciados
 * por `credentialKey`.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { SourcesFileSchema } from '@g4os/kernel/schemas';
import type {
  SourceAuthKind,
  SourceCategory,
  SourceConfigView,
  SourceKind,
  SourceStatus,
  SourcesFile,
} from '@g4os/kernel/types';

const FILE_NAME = 'sources.json';

export interface SourcesStoreOptions {
  readonly resolveWorkspaceRoot: (workspaceId: string) => string;
}

export interface InsertSourceInput {
  readonly workspaceId: string;
  readonly slug: string;
  readonly kind: SourceKind;
  readonly displayName: string;
  readonly category: SourceCategory;
  readonly authKind: SourceAuthKind;
  readonly enabled: boolean;
  readonly config: Readonly<Record<string, unknown>>;
  readonly description?: string;
  readonly iconUrl?: string;
  readonly credentialKey?: string;
}

export class SourcesStore {
  readonly #opts: SourcesStoreOptions;

  constructor(opts: SourcesStoreOptions) {
    this.#opts = opts;
  }

  async list(workspaceId: string): Promise<readonly SourceConfigView[]> {
    const file = await this.readFile(workspaceId);
    return file.sources;
  }

  async get(workspaceId: string, id: string): Promise<SourceConfigView | null> {
    const file = await this.readFile(workspaceId);
    return file.sources.find((s) => s.id === id) ?? null;
  }

  async getBySlug(workspaceId: string, slug: string): Promise<SourceConfigView | null> {
    const file = await this.readFile(workspaceId);
    return file.sources.find((s) => s.slug === slug) ?? null;
  }

  async insert(input: InsertSourceInput): Promise<SourceConfigView> {
    const file = await this.readFile(input.workspaceId);
    const existing = file.sources.find((s) => s.slug === input.slug);
    if (existing) {
      throw new Error(`source slug already exists: ${input.slug}`);
    }
    const now = Date.now();
    const source: SourceConfigView = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      slug: input.slug,
      kind: input.kind,
      displayName: input.displayName,
      category: input.category,
      authKind: input.authKind,
      enabled: input.enabled,
      status: 'disconnected' as SourceStatus,
      config: { ...input.config },
      ...(input.credentialKey === undefined ? {} : { credentialKey: input.credentialKey }),
      ...(input.iconUrl === undefined ? {} : { iconUrl: input.iconUrl }),
      ...(input.description === undefined ? {} : { description: input.description }),
      createdAt: now,
      updatedAt: now,
    };
    const next: SourcesFile = {
      version: 1,
      sources: [...file.sources, source],
    };
    await this.writeFile(input.workspaceId, next);
    return source;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: Partial<Pick<SourceConfigView, 'enabled' | 'status' | 'lastError' | 'config'>>,
  ): Promise<SourceConfigView | null> {
    const file = await this.readFile(workspaceId);
    const idx = file.sources.findIndex((s) => s.id === id);
    if (idx < 0) return null;
    const current = file.sources[idx];
    if (!current) return null;
    const updated: SourceConfigView = {
      ...current,
      ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
      ...(patch.status === undefined ? {} : { status: patch.status }),
      ...(patch.lastError === undefined ? {} : { lastError: patch.lastError }),
      ...(patch.config === undefined ? {} : { config: { ...patch.config } }),
      updatedAt: Date.now(),
    };
    const next: SourcesFile = {
      version: 1,
      sources: file.sources.map((s, i) => (i === idx ? updated : s)),
    };
    await this.writeFile(workspaceId, next);
    return updated;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    const file = await this.readFile(workspaceId);
    const before = file.sources.length;
    const next: SourcesFile = {
      version: 1,
      sources: file.sources.filter((s) => s.id !== id),
    };
    if (next.sources.length === before) return false;
    await this.writeFile(workspaceId, next);
    return true;
  }

  private path(workspaceId: string): string {
    return join(this.#opts.resolveWorkspaceRoot(workspaceId), FILE_NAME);
  }

  private async readFile(workspaceId: string): Promise<SourcesFile> {
    try {
      const raw = await readFile(this.path(workspaceId), 'utf8');
      const parsed = SourcesFileSchema.parse(JSON.parse(raw));
      return parsed;
    } catch (err) {
      if (isNotFound(err)) return { version: 1, sources: [] };
      throw err;
    }
  }

  private async writeFile(workspaceId: string, file: SourcesFile): Promise<void> {
    const path = this.path(workspaceId);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(file, null, 2), 'utf8');
    await rename(tmp, path);
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'ENOENT'
  );
}
