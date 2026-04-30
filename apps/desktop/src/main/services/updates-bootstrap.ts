/**
 * Bootstrap do auto-update.
 *
 * Wraps `electron-updater` via dynamic import (mantém o pacote opcional —
 * em E2E ou builds sem updater configurado, falha de import vira NOOP).
 * Expõe o adapter `UpdatesService` que o tRPC consome via `updates.check`.
 *
 * Wiring:
 * - `main/index.ts` chama `createUpdatesRuntime` no boot
 * - `runtime.service` entra em `services.updates` do `initIpcServer`
 * - `runtime.dispose` registra-se em `registerShutdownHandlers`
 *
 * Em runtime sem `electron-updater` (dev sem configurar feed, E2E):
 * `service.check()` retorna `{ hasUpdate: false }` em vez de erro — UI
 * consumidora não precisa branch especial, e operador vê via log.
 */

import type { UpdatesService } from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { err, ok, type Result } from 'neverthrow';
import { type UpdateChannel, UpdateService } from './update-service.ts';

const log = createLogger('updates-bootstrap');

export interface UpdatesRuntime {
  readonly service: UpdatesService;
  /** `null` quando electron-updater não está disponível (dev/E2E). */
  readonly updateService: UpdateService | null;
  dispose(): void;
}

export interface CreateUpdatesRuntimeOptions {
  readonly channel?: UpdateChannel;
  readonly disabled?: boolean;
}

export async function createUpdatesRuntime(
  options: CreateUpdatesRuntimeOptions = {},
): Promise<UpdatesRuntime> {
  if (options.disabled === true) {
    log.info({}, 'updates runtime disabled — service returns no-op');
    return noopRuntime();
  }

  const updater = await loadAutoUpdater();
  if (!updater) {
    log.warn({}, 'electron-updater unavailable; updates.check will be no-op');
    return noopRuntime();
  }

  const updateService = new UpdateService({
    updater,
    initialChannel: options.channel ?? 'stable',
  });

  const service: UpdatesService = {
    check: async () => {
      try {
        const info = await updateService.checkForUpdates();
        if (!info) return ok({ hasUpdate: false });
        return ok({ hasUpdate: true, version: info.version });
      } catch (cause) {
        log.warn({ err: cause }, 'updates.check failed');
        const message = cause instanceof Error ? cause.message : String(cause);
        return err(
          new AppError({
            code: ErrorCode.NETWORK_ERROR,
            message: `updates.check failed: ${message}`,
          }) as unknown as AppError,
        ) as unknown as Result<{ hasUpdate: boolean; version?: string }, AppError>;
      }
    },
  };

  return {
    service,
    updateService,
    dispose: () => updateService.dispose(),
  };
}

function noopRuntime(): UpdatesRuntime {
  const service: UpdatesService = {
    check: async () => ok({ hasUpdate: false }),
  };
  return {
    service,
    updateService: null,
    dispose: () => {
      /* nothing */
    },
  };
}

/**
 * Carrega `electron-updater` por dynamic import com `/* @vite-ignore *\/`
 * para evitar bundling em dev (Vite não trata bem o pacote em main).
 *
 * Retorna `null` em qualquer falha — caller decide o comportamento.
 */
async function loadAutoUpdater(): Promise<import('electron-updater').AppUpdater | null> {
  try {
    const specifier = 'electron-updater';
    const mod = (await import(/* @vite-ignore */ specifier)) as typeof import('electron-updater');
    return mod.autoUpdater;
  } catch (cause) {
    log.debug({ err: cause }, 'electron-updater dynamic import failed');
    return null;
  }
}
