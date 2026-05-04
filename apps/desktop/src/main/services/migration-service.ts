/**
 * MigrationService — facade que adapta `@g4os/migration` ao contrato
 * `MigrationService` do IPC. Expõe `detect()`, `plan()` e `execute()`.
 *
 * Stateless: caller (UI Wizard / CLI) chama `detect()` → `plan()` →
 * `execute()` em sequência, passando os outputs anteriores como input.
 *
 * Writers V2 (workspaces/sources/sessions) ficam em `migration/writers.ts`
 * — composição de SessionsRepository + SourcesStore + drizzle. Step
 * `credentials` usa o vault injetado e v1MasterKey vindo do input.
 */

import { join } from 'node:path';
import type { CredentialVault } from '@g4os/credentials';
import type { AppDb } from '@g4os/data';
import type { SessionsRepository } from '@g4os/data/sessions';
import type {
  MigrationService as IMigrationService,
  MigrationExecuteInputView,
  MigrationPlanView,
  MigrationReportView,
  V1InstallView,
} from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import {
  createMigrationPlan,
  detectV1Install,
  execute,
  type MigrationPlan,
  type ProgressEvent,
  type V1Install,
} from '@g4os/migration';
import { getAppPaths, getHomeDir } from '@g4os/platform';
import type { SourcesStore } from '@g4os/sources/store';
import { err, ok, type Result } from 'neverthrow';
import {
  buildSessionWriter,
  buildSourceWriter,
  buildWorkspaceWriter,
} from './migration/writers.ts';

const log = createLogger('migration-service');

export interface MigrationServiceDeps {
  readonly drizzle: AppDb;
  readonly sessionsRepo: SessionsRepository;
  readonly sourcesStore: SourcesStore;
  readonly vault: CredentialVault;
  readonly resolveWorkspaceRoot: (id: string) => string;
}

export class MigrationServiceImpl implements IMigrationService {
  readonly #deps: MigrationServiceDeps;

  constructor(deps: MigrationServiceDeps) {
    this.#deps = deps;
  }

  async detect(): Promise<Result<V1InstallView | null, AppError>> {
    try {
      const v1 = await detectV1Install(getHomeDir());
      if (v1) log.info({ path: v1.path, version: v1.version }, 'V1 install detected');
      return ok(v1);
    } catch (cause) {
      log.warn({ err: cause }, 'V1 detection failed');
      return err(wrap('migration.detect', cause));
    }
  }

  async plan(input: {
    readonly source?: V1InstallView;
    readonly target?: string;
  }): Promise<Result<MigrationPlanView, AppError>> {
    try {
      const source = await this.resolveSource(input.source);
      if (!source) return err(notFound('migration.plan'));
      // CR-18 F-DT-G: subdiretório dedicado pra que rollback NUNCA toque a
      // V2 produtiva. `getAppPaths().data` é a raiz onde SQLite/JSONL/vault
      // V2 vivem; passar isso direto era catastrófico em caso de falha de
      // step (pre-fix do executor faria `rm -rf` no root).
      const target = input.target ?? join(getAppPaths().data, 'v1-migrated');
      const plan: MigrationPlan = await createMigrationPlan({ source, target });
      return ok(plan);
    } catch (cause) {
      log.warn({ err: cause }, 'plan failed');
      return err(wrap('migration.plan', cause));
    }
  }

  async execute(input: MigrationExecuteInputView): Promise<Result<MigrationReportView, AppError>> {
    try {
      const source = await this.resolveSource(input.source);
      if (!source) return err(notFound('migration.execute'));
      // CR-18 F-DT-G: subdiretório dedicado pra que rollback NUNCA toque a
      // V2 produtiva. `getAppPaths().data` é a raiz onde SQLite/JSONL/vault
      // V2 vivem; passar isso direto era catastrófico em caso de falha de
      // step (pre-fix do executor faria `rm -rf` no root).
      const target = input.target ?? join(getAppPaths().data, 'v1-migrated');

      const plan = await createMigrationPlan({ source, target });
      log.info(
        { source: plan.source.path, target: plan.target, steps: plan.steps.length },
        'starting migration execute',
      );

      const writersInput = {
        drizzle: this.#deps.drizzle,
        sessionsRepo: this.#deps.sessionsRepo,
        sourcesStore: this.#deps.sourcesStore,
        resolveWorkspaceRoot: this.#deps.resolveWorkspaceRoot,
      };

      const result = await execute(plan, {
        dryRun: input.dryRun ?? false,
        force: input.force ?? false,
        onProgress: logProgress,
        stepOptions: {
          vault: this.#deps.vault,
          ...(input.v1MasterKey ? { v1MasterKey: input.v1MasterKey } : {}),
          workspaceWriter: buildWorkspaceWriter(writersInput),
          sourceWriter: buildSourceWriter(writersInput),
          sessionWriter: buildSessionWriter(writersInput),
        },
      });

      if (result.isErr()) {
        // CR-18 F-DT-K: serializa o erro via `toJSON()` (que NÃO inclui
        // `cause` nem `context.v1MasterKey`) para evitar vazar a master
        // key em `error.log` se algum step puser o key no `error.context`
        // por descuido. Quando AppError, usa toJSON; senão, fallback message.
        const safeErr =
          result.error instanceof AppError
            ? result.error.toJSON()
            : { message: String(result.error) };
        log.error({ err: safeErr }, 'migration execute failed');
        return err(result.error);
      }
      log.info(
        {
          duration: result.value.finishedAt - result.value.startedAt,
          stepCount: result.value.stepResults.length,
        },
        'migration execute complete',
      );
      return ok(result.value);
    } catch (cause) {
      log.error({ err: cause }, 'execute threw');
      return err(wrap('migration.execute', cause));
    }
  }

  private resolveSource(view?: V1InstallView): Promise<V1Install | null> {
    if (view) {
      return Promise.resolve({ path: view.path, version: view.version, flavor: view.flavor });
    }
    return detectV1Install(getHomeDir());
  }
}

function logProgress(ev: ProgressEvent): void {
  log.debug(
    {
      stepKind: ev.stepKind,
      stepIndex: ev.stepIndex,
      stepCount: ev.stepCount,
      progress: ev.stepProgress,
    },
    ev.message,
  );
}

function wrap(scope: string, cause: unknown): AppError {
  return new AppError({
    code: ErrorCode.UNKNOWN_ERROR,
    message: `${scope}: falha inesperada`,
    cause: cause instanceof Error ? cause : undefined,
  });
}

function notFound(scope: string): AppError {
  return new AppError({
    code: ErrorCode.UNKNOWN_ERROR,
    message: `${scope}: V1 install não encontrado`,
  });
}
