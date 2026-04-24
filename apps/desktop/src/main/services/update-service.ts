import { createLogger, DisposableBase, toDisposable } from '@g4os/kernel';
import type { AppUpdater, ProgressInfo, UpdateInfo } from 'electron-updater';

export type UpdateChannel = 'stable' | 'beta' | 'canary';

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available'; info: UpdateInfo }
  | { status: 'not-available' }
  | { status: 'downloading'; progress: ProgressInfo }
  | { status: 'downloaded'; info: UpdateInfo }
  | { status: 'error'; message: string };

export interface UpdateServiceOptions {
  /** `autoUpdater` do electron-updater — injetado para testes */
  updater: AppUpdater;
  /** Channel default (persistido em preferences); pode ser mudado em runtime */
  initialChannel?: UpdateChannel;
  /** Callback para UI de progresso/estado */
  onStateChange?: (state: UpdateState) => void;
}

/**
 * Wrapper fino sobre electron-updater com:
 * - Channels (stable/beta/canary)
 * - autoDownload desligado (usuário confirma)
 * - Install on quit (não força restart)
 * - Signature verification strict por padrão (compat mode só via opt-in)
 *
 * O feed é resolvido pelo electron-updater a partir do bloco `publish`
 * do electron-builder.config.ts (Cloudflare R2 via provider s3). Nenhum
 * feed URL hardcoded aqui.
 */
export class UpdateService extends DisposableBase {
  private readonly logger = createLogger('update-service');
  private readonly updater: AppUpdater;
  private readonly onStateChange: ((state: UpdateState) => void) | undefined;
  private currentState: UpdateState = { status: 'idle' };
  private channel: UpdateChannel;

  constructor(options: UpdateServiceOptions) {
    super();
    this.updater = options.updater;
    this.onStateChange = options.onStateChange;
    this.channel = options.initialChannel ?? 'stable';

    this.updater.channel = this.channel;
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = true;

    // Signature verification: electron-updater default é strict e não tem
    // API pública para "compat mode" (V1 precisou de fork). Mantemos strict.

    this.wireEvents();
  }

  private wireEvents(): void {
    const onAvailable = (info: UpdateInfo): void => {
      this.setState({ status: 'available', info });
    };
    const onNotAvailable = (): void => {
      this.setState({ status: 'not-available' });
    };
    const onProgress = (progress: ProgressInfo): void => {
      this.setState({ status: 'downloading', progress });
    };
    const onDownloaded = (info: UpdateInfo): void => {
      this.setState({ status: 'downloaded', info });
    };
    const onError = (err: Error): void => {
      this.logger.error({ err: err.message }, 'update error');
      this.setState({ status: 'error', message: err.message });
    };

    this.updater.on('update-available', onAvailable);
    this.updater.on('update-not-available', onNotAvailable);
    this.updater.on('download-progress', onProgress);
    this.updater.on('update-downloaded', onDownloaded);
    this.updater.on('error', onError);

    this._register(
      toDisposable(() => {
        this.updater.off('update-available', onAvailable);
        this.updater.off('update-not-available', onNotAvailable);
        this.updater.off('download-progress', onProgress);
        this.updater.off('update-downloaded', onDownloaded);
        this.updater.off('error', onError);
      }),
    );
  }

  setChannel(channel: UpdateChannel): void {
    this.channel = channel;
    this.updater.channel = channel;
    this.logger.info({ channel }, 'channel changed');
  }

  getChannel(): UpdateChannel {
    return this.channel;
  }

  getState(): UpdateState {
    return this.currentState;
  }

  async checkForUpdates(): Promise<UpdateInfo | null> {
    this.setState({ status: 'checking' });
    try {
      const result = await this.updater.checkForUpdates();
      return result?.updateInfo ?? null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setState({ status: 'error', message });
      return null;
    }
  }

  async downloadUpdate(): Promise<void> {
    try {
      await this.updater.downloadUpdate();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setState({ status: 'error', message });
      throw err;
    }
  }

  quitAndInstall(): void {
    this.updater.quitAndInstall(false, true);
  }

  private setState(state: UpdateState): void {
    this.currentState = state;
    this.onStateChange?.(state);
  }
}
