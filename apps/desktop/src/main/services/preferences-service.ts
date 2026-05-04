/**
 * Adapter `PreferencesService` (interface IPC) sobre o `PreferencesStore`
 * + `DebugHudRuntime`. Quando `setDebugHudEnabled` é chamado, persiste
 * no store **e** propaga para o runtime do HUD em tempo real (registra/
 * desregistra atalho global, fecha/abre janela).
 *
 * Fase 2 + verifyRuntimeIntegrity on-demand.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PreferencesService, RuntimeIntegrityReport } from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { type IntegrityFailure, loadInstallMeta, verifyRuntimeHashes } from '@g4os/platform';
import { err, ok } from 'neverthrow';
import type { DebugHudRuntime } from '../debug-hud/index.ts';
import type { PreferencesStore } from './preferences-store.ts';

const log = createLogger('preferences-service');

export interface CreatePreferencesServiceDeps {
  readonly store: PreferencesStore;
  readonly debugHud: DebugHudRuntime | null;
  /** `app.isPackaged` — define caminhos de install-meta + vendor. */
  readonly isPackaged: boolean;
  /** App version corrente (`app.getVersion()`) — para cross-check. */
  readonly appVersion: string;
}

export function createPreferencesService(deps: CreatePreferencesServiceDeps): PreferencesService {
  return {
    async getDebugHudEnabled() {
      try {
        const value = await deps.store.getDebugHudEnabled();
        return ok(value);
      } catch (cause) {
        log.warn({ err: cause }, 'failed to read debug.hud.enabled');
        return err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: 'Falha ao ler preferences',
            cause: cause instanceof Error ? cause : undefined,
          }),
        );
      }
    },
    async setDebugHudEnabled(enabled: boolean) {
      try {
        await deps.store.setDebugHudEnabled(enabled);
        if (deps.debugHud) {
          await deps.debugHud.setEnabled(enabled);
        }
        return ok(undefined);
      } catch (cause) {
        log.warn({ err: cause, enabled }, 'failed to persist debug.hud.enabled');
        return err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: 'Falha ao salvar preferences',
            cause: cause instanceof Error ? cause : undefined,
          }),
        );
      }
    },
    async verifyRuntimeIntegrity() {
      try {
        const resourcesPath = deps.isPackaged
          ? process.resourcesPath
          : resolve(dirname(fileURLToPath(import.meta.url)), '../../../../dist');
        const vendorDir = resolve(resourcesPath, 'vendor');

        // F-CR51-11: passa `target` para detectar manifesto de outro target.
        // ADR-0146. process.platform/arch são lidos via composição — não secret.
        const runtimeTarget = `${process.platform}-${process.arch}`;
        const metaResult = await loadInstallMeta({
          resourcesPath,
          appVersion: deps.appVersion,
          target: runtimeTarget,
        });

        if (!metaResult.ok) {
          // Sem manifest, não há o que checar contra. Reporta como
          // not-ok mas com `metaPresent=false` para a UI orientar
          // "rode `pnpm prebundle`" ou "reinstale".
          const metaPath = 'path' in metaResult.failure ? metaResult.failure.path : undefined;
          return ok<RuntimeIntegrityReport, AppError>({
            ok: false,
            metaPresent: false,
            ...(metaPath ? { metaPath } : {}),
            failures: [mapFailure(metaResult.failure)],
            checkedRuntimes: 0,
          });
        }

        const meta = metaResult.meta;
        const verify = await verifyRuntimeHashes({ meta, vendorDir });

        return ok<RuntimeIntegrityReport, AppError>({
          ok: verify.ok,
          metaPresent: true,
          metaPath: resolve(resourcesPath, 'install-meta.json'),
          appVersion: meta.appVersion,
          flavor: meta.flavor,
          target: meta.target,
          builtAt: meta.builtAt,
          failures: verify.failures.map(mapFailure),
          checkedRuntimes: Object.keys(meta.runtimes).length,
        });
      } catch (cause) {
        log.warn({ err: cause }, 'verifyRuntimeIntegrity failed');
        return err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: 'Falha ao verificar integridade',
            cause: cause instanceof Error ? cause : undefined,
          }),
        );
      }
    },
  };
}

function mapFailure(failure: IntegrityFailure): RuntimeIntegrityReport['failures'][number] {
  switch (failure.code) {
    case 'meta_missing':
    case 'meta_corrupt':
      return {
        code: failure.code,
        path: failure.path,
        ...('cause' in failure ? { actual: failure.cause } : {}),
      };
    case 'app_version_mismatch':
      return {
        code: failure.code,
        expected: failure.expected,
        actual: failure.actual,
      };
    case 'runtime_missing':
      return {
        code: failure.code,
        runtime: failure.runtime,
        path: failure.path,
      };
    case 'hash_mismatch':
      return {
        code: failure.code,
        runtime: failure.runtime,
        expected: failure.expected,
        actual: failure.actual,
      };
    case 'target_mismatch':
      // CR-38 F-CR38-2: manifesto de outro target (ex.: build win32 em runtime macOS).
      return {
        code: failure.code,
        expected: failure.expected,
        actual: failure.actual,
      };
  }
}
