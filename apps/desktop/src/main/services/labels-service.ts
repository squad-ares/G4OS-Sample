/**
 * LabelsService — adapter fino sobre `LabelsRepository` do @g4os/data.
 * Sem lógica de negócio: é só dispatch + Result wrapping. Reparent valida
 * que o novo parent não é descendente antes de delegar ao repo.
 */

import type { AppDb } from '@g4os/data';
import { LabelsRepository } from '@g4os/data/labels';
import type { LabelsService as LabelsServiceContract } from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import type { Label, LabelCreateInput, LabelId, WorkspaceId } from '@g4os/kernel/types';
import { err, ok, type Result } from 'neverthrow';

const log = createLogger('labels-service');

export interface LabelsServiceDeps {
  readonly drizzle: AppDb;
}

class SqliteLabelsService implements LabelsServiceContract {
  readonly #repo: LabelsRepository;

  constructor(deps: LabelsServiceDeps) {
    this.#repo = new LabelsRepository(deps.drizzle);
  }

  async list(workspaceId: WorkspaceId): Promise<Result<readonly Label[], AppError>> {
    try {
      const items = await this.#repo.list(workspaceId);
      return ok(items);
    } catch (error) {
      return this.fail('labels.list', error, { workspaceId });
    }
  }

  async create(input: LabelCreateInput): Promise<Result<Label, AppError>> {
    try {
      const created = await this.#repo.create(input);
      return ok(created);
    } catch (error) {
      return this.fail('labels.create', error, { workspaceId: input.workspaceId });
    }
  }

  async rename(id: LabelId, name: string): Promise<Result<void, AppError>> {
    try {
      await this.#repo.rename(id, name);
      return ok(undefined);
    } catch (error) {
      return this.fail('labels.rename', error, { id });
    }
  }

  async recolor(id: LabelId, color: string | null): Promise<Result<void, AppError>> {
    try {
      await this.#repo.recolor(id, color);
      return ok(undefined);
    } catch (error) {
      return this.fail('labels.recolor', error, { id });
    }
  }

  async reparent(id: LabelId, newParentId: LabelId | null): Promise<Result<void, AppError>> {
    if (newParentId !== null) {
      const target = await this.#repo.get(id);
      const nextParent = await this.#repo.get(newParentId);
      if (!target || !nextParent) {
        return err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: 'label or parent not found',
            context: { id, newParentId },
          }),
        );
      }
      if (nextParent.treeCode.startsWith(`${target.treeCode}.`)) {
        return err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: 'new parent would create a cycle',
            context: { id, newParentId },
          }),
        );
      }
    }
    try {
      await this.#repo.reparent(id, newParentId);
      return ok(undefined);
    } catch (error) {
      return this.fail('labels.reparent', error, { id, newParentId });
    }
  }

  async delete(id: LabelId): Promise<Result<void, AppError>> {
    try {
      await this.#repo.delete(id);
      return ok(undefined);
    } catch (error) {
      return this.fail('labels.delete', error, { id });
    }
  }

  private fail<T>(
    scope: string,
    error: unknown,
    context: Record<string, unknown>,
  ): Result<T, AppError> {
    log.error({ err: error, ...context }, `${scope} failed`);
    return err(
      new AppError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: `${scope} failed`,
        context,
        cause: error,
      }),
    );
  }
}

export function createLabelsService(deps: LabelsServiceDeps): LabelsServiceContract {
  return new SqliteLabelsService(deps);
}
