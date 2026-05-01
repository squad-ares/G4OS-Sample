/**
 * MigrationService — facade que adapta `@g4os/migration` ao contrato
 * `MigrationService` do IPC. Expõe `detect()` e `plan()` por enquanto;
 * `execute()` virá com slice 4 part 2 (writers + UI Wizard).
 *
 * Não há `lastDetectedInstall` cache aqui — caller (UI Wizard) é
 * responsável por chamar `detect()` e passar o resultado pra `plan()`.
 * Mantém o service stateless e testável.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  MigrationService as IMigrationService,
  MigrationPlanView,
  V1InstallView,
} from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import {
  createMigrationPlan,
  detectV1Install,
  type MigrationPlan,
  type V1Install,
} from '@g4os/migration';
import { getAppPaths } from '@g4os/platform';
import { err, ok, type Result } from 'neverthrow';

const log = createLogger('migration-service');

export class MigrationServiceImpl implements IMigrationService {
  async detect(): Promise<Result<V1InstallView | null, AppError>> {
    try {
      const v1 = await detectV1Install(homedir());
      if (v1) log.info({ path: v1.path, version: v1.version }, 'V1 install detected');
      return ok(v1);
    } catch (cause) {
      log.warn({ err: cause }, 'V1 detection failed');
      return err(
        new AppError({
          code: ErrorCode.UNKNOWN_ERROR,
          message: 'migration.detect: falha inesperada',
          cause: cause instanceof Error ? cause : undefined,
        }),
      );
    }
  }

  async plan(input: {
    readonly source?: V1InstallView;
    readonly target?: string;
  }): Promise<Result<MigrationPlanView, AppError>> {
    try {
      // Se source não veio, redetect — UI pode chamar plan() diretamente
      // depois de detect(), mas testamos defensivamente.
      const source: V1Install | null = input.source
        ? { path: input.source.path, version: input.source.version, flavor: input.source.flavor }
        : await detectV1Install(homedir());
      if (!source) {
        return err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: 'migration.plan: V1 install não encontrado',
          }),
        );
      }
      const target = input.target ?? join(getAppPaths().data);
      const plan: MigrationPlan = await createMigrationPlan({ source, target });
      // MigrationPlan e MigrationPlanView são structuralmente compatíveis
      // (plan já tem source/target/steps/estimatedSize/warnings/alreadyMigrated).
      return ok(plan);
    } catch (cause) {
      log.warn({ err: cause }, 'plan failed');
      return err(
        new AppError({
          code: ErrorCode.UNKNOWN_ERROR,
          message: 'migration.plan: falha inesperada',
          cause: cause instanceof Error ? cause : undefined,
        }),
      );
    }
  }
}
