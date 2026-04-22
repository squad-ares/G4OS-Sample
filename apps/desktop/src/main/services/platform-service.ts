import type { PlatformService } from '@g4os/ipc/server';
import type { ElectronRuntime } from '../electron-runtime.ts';

export function createPlatformService(runtime: ElectronRuntime): PlatformService {
  return {
    async showSaveDialog(options) {
      const handler = runtime.dialog?.showSaveDialog;
      if (!handler) return { canceled: true };
      const result = await handler({
        ...(options.title ? { title: options.title } : {}),
        ...(options.defaultPath ? { defaultPath: options.defaultPath } : {}),
        ...(options.filters
          ? {
              filters: options.filters.map((f) => ({
                name: f.name,
                extensions: [...f.extensions],
              })),
            }
          : {}),
      });
      return {
        canceled: result.canceled,
        ...(result.filePath ? { filePath: result.filePath } : {}),
      };
    },

    async showOpenDialog(options) {
      const handler = runtime.dialog?.showOpenDialog;
      if (!handler) return { canceled: true, filePaths: [] };
      const result = await handler({
        ...(options.title ? { title: options.title } : {}),
        ...(options.defaultPath ? { defaultPath: options.defaultPath } : {}),
        ...(options.filters
          ? {
              filters: options.filters.map((f) => ({
                name: f.name,
                extensions: [...f.extensions],
              })),
            }
          : {}),
        properties: ['openFile'],
      });
      return { canceled: result.canceled, filePaths: result.filePaths };
    },
  };
}
