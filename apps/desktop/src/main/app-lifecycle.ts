import { createLogger } from '@g4os/kernel/logger';
import type { ElectronApp, ElectronEvent } from './electron-runtime.ts';

const log = createLogger('app-lifecycle');

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;

type ShutdownHandler = () => Promise<void> | void;
type OpenUrlHandler = (url: string) => void;

export interface AppLifecycleOptions {
  readonly shutdownTimeoutMs?: number;
}

export class AppLifecycle {
  private readonly shutdownHandlers: ShutdownHandler[] = [];
  private readonly allWindowsClosedHandlers: Array<() => void> = [];
  private readonly openUrlHandlers: OpenUrlHandler[] = [];
  private isShuttingDown = false;

  constructor(
    private readonly app: ElectronApp,
    private readonly options: AppLifecycleOptions = {},
  ) {
    this.app.on('before-quit', (event: ElectronEvent) => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      event.preventDefault();
      this.shutdown()
        .catch((err: unknown) => log.error({ err }, 'shutdown errored'))
        .finally(() => this.app.exit(0));
    });

    this.app.on('window-all-closed', () => {
      for (const h of this.allWindowsClosedHandlers) h();
    });

    this.app.on('open-url', (event: ElectronEvent, url: string) => {
      event.preventDefault();
      for (const h of this.openUrlHandlers) h(url);
    });

    const handleSignal = (): void => {
      this.app.quit();
    };
    process.on('SIGINT', handleSignal);
    process.on('SIGTERM', handleSignal);
  }

  onQuit(handler: ShutdownHandler): void {
    this.shutdownHandlers.push(handler);
  }

  onAllWindowsClosed(handler: () => void): void {
    this.allWindowsClosedHandlers.push(handler);
  }

  onOpenUrl(handler: OpenUrlHandler): void {
    this.openUrlHandlers.push(handler);
  }

  async shutdown(): Promise<void> {
    const timeoutMs = this.options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS;
    log.info({ count: this.shutdownHandlers.length, timeoutMs }, 'shutdown begin');

    await Promise.allSettled(
      this.shutdownHandlers.map(async (handler) => {
        try {
          await Promise.race([Promise.resolve(handler()), timeoutRejection(timeoutMs)]);
        } catch (err) {
          log.error({ err }, 'shutdown handler failed');
        }
      }),
    );

    log.info('shutdown done');
  }
}

function timeoutRejection(ms: number): Promise<never> {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('shutdown handler timeout')), ms);
  });
}
