/**
 * Bootstrap das ações do Debug HUD: monta closures que dependem do
 * composition root (Electron `dialog`, `app`, paths) sem importá-los
 * dentro de `main/debug-hud/`.
 *
 * Mantém o módulo `debug-hud/` com baixa dependência (só
 * `@g4os/observability/memory` + tipos). As funções aqui retornadas
 * são injetadas via `CreateDebugHudOptions`.
 */

import os from 'node:os';
import { createLogger } from '@g4os/kernel/logger';
import { exportDebugInfo } from '@g4os/observability/debug';

const log = createLogger('debug-hud:actions-bootstrap');

// F-CR31-8: constantes centralizadas. Strings que vão pro Save Dialog
// nativo do SO ficam aqui em vez de espalhadas pelo código. Idealmente
// `DIALOG_TITLE_PT_BR` viraria TranslationKey resolvido pelo composition
// root (que tem acesso ao locale via PreferencesStore), mas por ora
// fallback fixo + concentração em uma constante facilita refactor futuro.
const DIALOG_TITLE_PT_BR = 'Exportar diagnóstico';
const FILENAME_PREFIX = 'g4os-diagnostic';
const DEFAULT_APP_NAME = '@g4os/desktop';

interface ElectronLike {
  readonly app: {
    readonly name?: string;
    readonly getName?: () => string;
    readonly getVersion?: () => string;
  };
  readonly dialog?: {
    showSaveDialog?(options: {
      title?: string;
      defaultPath?: string;
      filters?: ReadonlyArray<{ name: string; extensions: string[] }>;
    }): Promise<{ canceled: boolean; filePath?: string }>;
  };
}

interface WindowWithReload {
  readonly webContents: { reload?: () => void };
}

interface WindowsLike {
  /** F-CR31-7: contrato explícito pra "janela principal", evita `list()[0]` ambíguo. */
  getMain(): unknown;
}

export interface DebugHudActionsBootstrapOptions {
  readonly electron: ElectronLike;
  readonly windowManager: WindowsLike;
  readonly logsDir: string;
  readonly crashesDir: string;
  readonly appVersion: string;
  readonly electronVersion?: string;
}

export interface DebugHudActionsBootstrap {
  readonly reloadMainWindow: () => void;
  readonly exportDiagnostic: () => Promise<string | null>;
}

export function createDebugHudActionsBootstrap(
  options: DebugHudActionsBootstrapOptions,
): DebugHudActionsBootstrap {
  const { electron, windowManager, logsDir, crashesDir, appVersion, electronVersion } = options;

  const reloadMainWindow = (): void => {
    const main = windowManager.getMain() as WindowWithReload | undefined;
    if (!main) {
      log.warn({}, 'reload-renderer chamado sem janela principal disponível');
      return;
    }
    main.webContents.reload?.();
  };

  const exportDiagnostic = async (): Promise<string | null> => {
    if (!electron.dialog?.showSaveDialog) {
      log.warn({}, 'export-diagnostic chamado sem dialog disponível');
      return null;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const result = await electron.dialog.showSaveDialog({
      title: DIALOG_TITLE_PT_BR,
      defaultPath: `${FILENAME_PREFIX}-${stamp}.zip`,
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (result.canceled || !result.filePath) return null;

    const appName = electron.app.getName?.() ?? electron.app.name ?? DEFAULT_APP_NAME;
    await exportDebugInfo({
      outputPath: result.filePath,
      logsDir,
      crashesDir,
      systemInfo: {
        app: { name: appName, version: appVersion },
        platform: {
          os: `${os.platform()} ${os.release()}`,
          arch: os.arch(),
          nodeVersion: process.version,
          ...(electronVersion ? { electronVersion } : {}),
          memoryTotalBytes: os.totalmem(),
          cpus: os.cpus().length,
        },
      },
      // Config sanitizada do app — ZIP é exportado pra investigação,
      // então deixamos vazio aqui (caller pode injetar futuramente).
      config: {},
    });
    return result.filePath;
  };

  return { reloadMainWindow, exportDiagnostic };
}
