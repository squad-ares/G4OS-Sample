import { randomUUID } from 'node:crypto';
import type { AppDb } from '@g4os/data';
import { workspaces } from '@g4os/data/schema';
import type { WorkspacesService as WorkspacesServiceContract } from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import type { Workspace, WorkspaceId } from '@g4os/kernel/types';
import { eq } from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';
import {
  bootstrapWorkspaceFilesystem,
  cleanupWorkspaceFilesystem,
  seedDefaultLabels,
} from './workspaces/filesystem.ts';
import {
  deserializeWorkspaceRow,
  serializeWorkspaceDetails,
  type WorkspaceRow,
} from './workspaces/serialize.ts';
import { slugifyWorkspaceName } from './workspaces/slug.ts';

const log = createLogger('workspaces-service');

export interface WorkspacesServiceDeps {
  readonly drizzle: AppDb;
  readonly resolveRootPath: (id: WorkspaceId) => string;
  /** Data central (ex: `<data>/workspaces`) usado para validar paths internos ao cleanup. */
  readonly managedRoot: string;
}

export class SqliteWorkspacesService implements WorkspacesServiceContract {
  readonly #deps: WorkspacesServiceDeps;

  constructor(deps: WorkspacesServiceDeps) {
    this.#deps = deps;
  }

  list(): Promise<Result<readonly Workspace[], AppError>> {
    const rows = this.#deps.drizzle.select().from(workspaces).all() as WorkspaceRow[];
    const items = rows
      .map((row) => safeDeserialize(row))
      .filter((value): value is Workspace => value !== null);
    return Promise.resolve(ok(items));
  }

  get(id: WorkspaceId): Promise<Result<Workspace, AppError>> {
    const row = this.#deps.drizzle.select().from(workspaces).where(eq(workspaces.id, id)).get() as
      | WorkspaceRow
      | undefined;

    if (!row) {
      return Promise.resolve(
        err(
          new AppError({
            code: ErrorCode.WORKSPACE_NOT_FOUND,
            message: `workspace ${id} not found`,
            context: { id },
          }),
        ),
      );
    }
    const workspace = safeDeserialize(row);
    if (!workspace) {
      return Promise.resolve(
        err(
          new AppError({
            code: ErrorCode.WORKSPACE_CORRUPTED,
            message: `workspace ${id} corrupted metadata`,
            context: { id },
          }),
        ),
      );
    }
    return Promise.resolve(ok(workspace));
  }

  async create(input: Pick<Workspace, 'name' | 'rootPath'>): Promise<Result<Workspace, AppError>> {
    const id = randomUUID() as WorkspaceId;
    const slug = slugifyWorkspaceName(input.name);
    const now = Date.now();
    const rootPath = input.rootPath || this.#deps.resolveRootPath(id);

    const workspace: Workspace = {
      id,
      name: input.name.trim(),
      slug,
      rootPath,
      createdAt: now,
      updatedAt: now,
      defaults: { permissionMode: 'ask' },
      setupCompleted: false,
      styleSetupCompleted: false,
      metadata: {},
    };

    const metadataJson = serializeWorkspaceDetails(workspace);

    this.#deps.drizzle
      .insert(workspaces)
      .values({
        id,
        name: workspace.name,
        slug,
        rootPath,
        createdAt: now,
        updatedAt: now,
        metadata: metadataJson,
      })
      .run();

    try {
      await bootstrapWorkspaceFilesystem(rootPath);
      await seedDefaultLabels(rootPath);
    } catch (fsErr) {
      log.error({ err: fsErr, id, rootPath }, 'workspace filesystem bootstrap failed');
      this.#deps.drizzle.delete(workspaces).where(eq(workspaces.id, id)).run();
      return err(
        new AppError({
          code: ErrorCode.WORKSPACE_BOOTSTRAP_FAILED,
          message: 'failed to bootstrap workspace filesystem',
          context: { id, rootPath },
          cause: fsErr,
        }),
      );
    }

    log.info({ id, slug, rootPath }, 'workspace created');
    return ok(workspace);
  }

  async update(id: WorkspaceId, patch: Partial<Workspace>): Promise<Result<void, AppError>> {
    const current = await this.get(id);
    if (current.isErr()) return err(current.error);

    const merged: Workspace = {
      ...current.value,
      ...patch,
      id: current.value.id,
      createdAt: current.value.createdAt,
      updatedAt: Date.now(),
      defaults: { ...current.value.defaults, ...(patch.defaults ?? {}) },
      metadata: { ...current.value.metadata, ...(patch.metadata ?? {}) },
    };

    this.#deps.drizzle
      .update(workspaces)
      .set({
        name: merged.name,
        slug: merged.slug,
        rootPath: merged.rootPath,
        updatedAt: merged.updatedAt,
        metadata: serializeWorkspaceDetails(merged),
      })
      .where(eq(workspaces.id, id))
      .run();

    return ok(undefined);
  }

  async delete(
    id: WorkspaceId,
    options?: { readonly removeFiles?: boolean },
  ): Promise<Result<void, AppError>> {
    const current = await this.get(id);
    if (current.isErr()) return err(current.error);

    this.#deps.drizzle.delete(workspaces).where(eq(workspaces.id, id)).run();

    if (options?.removeFiles === true) {
      try {
        await cleanupWorkspaceFilesystem({
          rootPath: current.value.rootPath,
          managedRoot: this.#deps.managedRoot,
        });
      } catch (fsErr) {
        log.warn({ err: fsErr, id }, 'workspace filesystem cleanup failed');
      }
    }

    log.info({ id, removedFiles: options?.removeFiles === true }, 'workspace deleted');
    return ok(undefined);
  }
}

function safeDeserialize(row: WorkspaceRow): Workspace | null {
  try {
    return deserializeWorkspaceRow(row);
  } catch (parseErr) {
    log.warn({ err: parseErr, id: row.id }, 'failed to deserialize workspace row');
    return null;
  }
}

export function createWorkspacesService(deps: WorkspacesServiceDeps): WorkspacesServiceContract {
  return new SqliteWorkspacesService(deps);
}
