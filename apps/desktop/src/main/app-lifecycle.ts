import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type { ElectronApp, ElectronEvent } from './electron-runtime.ts';

const log = createLogger('app-lifecycle');

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;

type ShutdownHandler = () => Promise<void> | void;
type OpenUrlHandler = (url: string) => void;

export interface AppLifecycleOptions {
  readonly shutdownTimeoutMs?: number;
}

// CR6-06: extends DisposableBase para que SIGINT/SIGTERM e listeners de
// `app` sejam removidos no dispose. Cenário motivador: testes E2E
// (ADR-0142) reutilizam o processo Node parent — sem dispose, cada
// `launchApp()` empilha listeners no `process` global, causando double
// `app.quit()` e logs ruidosos.
export class AppLifecycle extends DisposableBase {
  private readonly shutdownHandlers: ShutdownHandler[] = [];
  private readonly allWindowsClosedHandlers: Array<() => void> = [];
  private readonly openUrlHandlers: OpenUrlHandler[] = [];
  private isShuttingDown = false;

  constructor(
    private readonly app: ElectronApp,
    private readonly options: AppLifecycleOptions = {},
  ) {
    super();

    const onBeforeQuit = (event: ElectronEvent): void => {
      if (this.isShuttingDown) return;
      this.isShuttingDown = true;
      event.preventDefault();
      this.shutdown()
        .catch((err: unknown) => log.error({ err }, 'shutdown errored'))
        .finally(() => this.app.exit(0));
    };
    const onWindowAllClosed = (): void => {
      for (const h of this.allWindowsClosedHandlers) h();
    };
    const onOpenUrl = (event: ElectronEvent, url: string): void => {
      event.preventDefault();
      for (const h of this.openUrlHandlers) h(url);
    };
    const onSignal = (): void => {
      this.app.quit();
    };

    this.app.on('before-quit', onBeforeQuit);
    this.app.on('window-all-closed', onWindowAllClosed);
    this.app.on('open-url', onOpenUrl);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);

    this._register(
      toDisposable(() => {
        this.app.removeListener?.('before-quit', onBeforeQuit);
        this.app.removeListener?.('window-all-closed', onWindowAllClosed);
        this.app.removeListener?.('open-url', onOpenUrl);
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
      }),
    );
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
    // CR9: `unref()` para o timer não segurar o process vivo. Cada handler
    // criava um setTimeout dedicado; sem unref, mesmo com handler resolvendo
    // antes, o timer permanecia ativo até o ms expirar — o `app.exit(0)`
    // final já cobre, mas usar unref alinha com pattern de outros timers
    // (MemoryMonitor, RotationOrchestrator) e evita teste E2E ficar lento.
    const handle = setTimeout(() => reject(new Error('shutdown handler timeout')), ms);
    handle.unref?.();
  });
}
