/**
 * SourcesService real (main process) — composa `SourcesStore` (JSON
 * persistence) + `managed-catalog` (seed dos connectors conhecidos).
 *
 * Phase 1: list/enable/disable/delete/create custom
 * MCP stdio e HTTP. `testConnection` devolve apenas o status persistido
 * por enquanto (runtime lifecycle via `SourceRegistry` vira em Phase 3 /
 * Managed connectors ainda são stubs — o catálogo está
 * visível no UI mas `activate()` real vem com os handlers.
 */

import type { CredentialVault } from '@g4os/credentials';
import type { SourcesService } from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import type {
  CreateMcpHttpSourceInput,
  CreateMcpStdioSourceInput,
  EnableManagedSourceInput,
  SourceCatalogItem,
  SourceConfigView,
  SourceId,
  SourceStatus,
  WorkspaceId,
} from '@g4os/kernel/types';
import { buildCatalog, catalogEntry } from '@g4os/sources/catalog';
import type { SourcesStore } from '@g4os/sources/store';
import { err, ok, type Result } from 'neverthrow';
import {
  deleteSourceSecrets,
  hydrateSourceSecrets,
  migrateStoredSourceSecrets,
  secureSourceConfigSecrets,
} from './sources/secrets.ts';
import { probeSource } from './sources/source-probe.ts';

const log = createLogger('sources-service');

export interface SourcesServiceDeps {
  readonly store: SourcesStore;
  readonly vault?: CredentialVault | undefined;
}

export function createSourcesService(deps: SourcesServiceDeps): SourcesService {
  const { store, vault } = deps;

  return {
    async list(workspaceId: WorkspaceId): Promise<Result<readonly SourceConfigView[], AppError>> {
      try {
        const sources = await store.list(workspaceId);
        const migrated = await Promise.all(
          sources.map((source) => migrateStoredSourceSecrets({ store, vault, source })),
        );
        return ok(migrated);
      } catch (error) {
        return err(wrap('sources.list', error, { workspaceId }));
      }
    },

    async listAvailable(
      workspaceId: WorkspaceId,
    ): Promise<Result<readonly SourceCatalogItem[], AppError>> {
      try {
        const existing = await store.list(workspaceId);
        const installed = new Set(existing.map((s) => s.slug));
        return ok(buildCatalog(installed));
      } catch (error) {
        return err(wrap('sources.listAvailable', error, { workspaceId }));
      }
    },

    async get(workspaceId: WorkspaceId, id: SourceId): Promise<Result<SourceConfigView, AppError>> {
      try {
        const found = await store.get(workspaceId, id);
        if (!found) return err(notFound(id));
        return ok(found);
      } catch (error) {
        return err(wrap('sources.get', error, { workspaceId, id }));
      }
    },

    async enableManaged(
      input: EnableManagedSourceInput,
    ): Promise<Result<SourceConfigView, AppError>> {
      const catalog = catalogEntry(input.slug);
      if (!catalog) {
        return err(
          new AppError({
            code: ErrorCode.VALIDATION_ERROR,
            message: `Unknown managed source slug: ${input.slug}`,
            context: { slug: input.slug },
          }),
        );
      }
      if (catalog.kind === 'managed' && catalog.authKind === 'oauth') {
        return err(
          new AppError({
            code: ErrorCode.VALIDATION_ERROR,
            message: `Managed source is not ready yet: ${input.slug}`,
            context: { slug: input.slug },
          }),
        );
      }
      try {
        return await enableManagedViaStore(store, input, catalog);
      } catch (error) {
        return err(wrap('sources.enableManaged', error, input));
      }
    },

    async createStdio(
      input: CreateMcpStdioSourceInput,
    ): Promise<Result<SourceConfigView, AppError>> {
      try {
        const existing = await store.getBySlug(input.workspaceId, input.slug);
        if (existing) {
          return err(
            new AppError({
              code: ErrorCode.VALIDATION_ERROR,
              message: `Source slug already exists: ${input.slug}`,
              context: { slug: input.slug },
            }),
          );
        }
        const secured = await secureSourceConfigSecrets({
          workspaceId: input.workspaceId,
          slug: input.slug,
          vault,
          config: {
            command: input.command,
            args: input.args,
            env: input.env,
          },
        });
        const created = await store.insert({
          workspaceId: input.workspaceId,
          slug: input.slug,
          kind: 'mcp-stdio',
          displayName: input.displayName,
          category: 'other',
          authKind: 'none',
          enabled: true,
          config: secured.config,
          ...(input.description === undefined ? {} : { description: input.description }),
        });
        log.info({ sourceId: created.id, slug: created.slug }, 'mcp-stdio source created');
        return ok(created);
      } catch (error) {
        return err(wrap('sources.createStdio', error, { slug: input.slug }));
      }
    },

    async createHttp(input: CreateMcpHttpSourceInput): Promise<Result<SourceConfigView, AppError>> {
      try {
        const existing = await store.getBySlug(input.workspaceId, input.slug);
        if (existing) {
          return err(
            new AppError({
              code: ErrorCode.VALIDATION_ERROR,
              message: `Source slug already exists: ${input.slug}`,
              context: { slug: input.slug },
            }),
          );
        }
        const secured = await secureSourceConfigSecrets({
          workspaceId: input.workspaceId,
          slug: input.slug,
          vault,
          config: {
            url: input.url,
            headers: input.headers,
          },
        });
        const created = await store.insert({
          workspaceId: input.workspaceId,
          slug: input.slug,
          kind: 'mcp-http',
          displayName: input.displayName,
          category: 'other',
          authKind: input.authKind,
          enabled: true,
          config: secured.config,
          ...(input.description === undefined ? {} : { description: input.description }),
        });
        log.info({ sourceId: created.id, slug: created.slug }, 'mcp-http source created');
        return ok(created);
      } catch (error) {
        return err(wrap('sources.createHttp', error, { slug: input.slug }));
      }
    },

    async setEnabled(
      workspaceId: WorkspaceId,
      id: SourceId,
      enabled: boolean,
    ): Promise<Result<SourceConfigView, AppError>> {
      try {
        const updated = await store.update(workspaceId, id, { enabled });
        if (!updated) return err(notFound(id));
        log.info({ id, enabled }, 'source enabled toggled');
        return ok(updated);
      } catch (error) {
        return err(wrap('sources.setEnabled', error, { workspaceId, id }));
      }
    },

    async delete(workspaceId: WorkspaceId, id: SourceId): Promise<Result<void, AppError>> {
      try {
        const existing = await store.get(workspaceId, id);
        const deleted = await store.delete(workspaceId, id);
        if (!deleted) return err(notFound(id));
        if (existing) await deleteSourceSecrets(existing, vault);
        log.info({ id, workspaceId }, 'source deleted');
        return ok(undefined);
      } catch (error) {
        return err(wrap('sources.delete', error, { workspaceId, id }));
      }
    },

    async testConnection(
      workspaceId: WorkspaceId,
      id: SourceId,
    ): Promise<Result<SourceStatus, AppError>> {
      try {
        const existing = await store.get(workspaceId, id);
        if (!existing) return err(notFound(id));
        const hydrated = await hydrateSourceSecrets(existing, vault);
        // Outer timeout (10s) defende contra MCP stdio prober que
        // não respeite seu próprio timeout (subprocess hung). Inner probes
        // já têm 5s por kind; outer cobre orquestração + race com hung.
        const probed = await Promise.race([
          probeSource(hydrated),
          new Promise<SourceStatus>((resolve) => {
            const t = setTimeout(() => resolve('error'), 10_000);
            t.unref?.();
          }),
        ]);
        // Persiste o status probed no JSON pra UI/planner refletirem o check.
        if (probed !== existing.status) {
          await store.update(workspaceId, id, { status: probed });
        }
        return ok(probed);
      } catch (error) {
        return err(wrap('sources.testConnection', error, { workspaceId, id }));
      }
    },
  };
}

async function enableManagedViaStore(
  store: SourcesStore,
  input: EnableManagedSourceInput,
  catalog: NonNullable<ReturnType<typeof catalogEntry>>,
): Promise<Result<SourceConfigView, AppError>> {
  const existing = await store.getBySlug(input.workspaceId, input.slug);
  if (existing) {
    if (existing.enabled) return ok(existing);
    const updated = await store.update(input.workspaceId, existing.id, { enabled: true });
    return ok(updated ?? existing);
  }
  const created = await store.insert({
    workspaceId: input.workspaceId,
    slug: catalog.slug,
    kind: catalog.kind,
    displayName: catalog.displayName,
    category: catalog.category,
    authKind: catalog.authKind,
    enabled: true,
    config: {},
    ...(catalog.description === undefined ? {} : { description: catalog.description }),
    ...(catalog.iconUrl === undefined ? {} : { iconUrl: catalog.iconUrl }),
  });
  log.info(
    { sourceId: created.id, slug: created.slug, workspaceId: input.workspaceId },
    'managed source enabled',
  );
  return ok(created);
}

function notFound(id: string): AppError {
  return new AppError({
    code: ErrorCode.SOURCE_NOT_FOUND,
    message: `Source not found: ${id}`,
    context: { id },
  });
}

function wrap(op: string, error: unknown, ctx: Record<string, unknown> = {}): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  log.error({ err: message, op, ...ctx }, 'sources service op failed');
  return new AppError({
    code: ErrorCode.UNKNOWN_ERROR,
    message,
    context: { op, ...ctx },
  });
}
