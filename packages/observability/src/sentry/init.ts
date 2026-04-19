import { createLogger } from '@g4os/kernel/logger';
import { type SentryEventLike, scrubSentryEvent } from './scrub.ts';

const log = createLogger('observability:sentry');

export type SentryProcess = 'main' | 'renderer' | 'worker';

export interface SentryInitOptions {
  readonly dsn: string | undefined;
  readonly release: string;
  readonly environment: string;
  readonly process: SentryProcess;
  readonly tracesSampleRate?: number;
  readonly replaysSessionSampleRate?: number;
  readonly replaysOnErrorSampleRate?: number;
}

export interface SentryHandle {
  close(): Promise<void>;
  setUser(user: { id: string; email?: string } | null): void;
  setTag(key: string, value: string): void;
}

const NOOP_HANDLE: SentryHandle = {
  close: () => Promise.resolve(),
  setUser: () => undefined,
  setTag: () => undefined,
};

interface SentryClientModule {
  init(options: Record<string, unknown>): void;
  close(timeout?: number): Promise<boolean>;
  setUser(user: { id: string; email?: string } | null): void;
  setTag(key: string, value: string): void;
}

export async function initSentry(options: SentryInitOptions): Promise<SentryHandle> {
  if (!options.dsn) {
    log.info({ process: options.process }, 'sentry disabled (no dsn); returning noop');
    return NOOP_HANDLE;
  }

  const mod = await loadSentryModule(options.process);

  const config: Record<string, unknown> = {
    dsn: options.dsn,
    release: options.release,
    environment: options.environment,
    tracesSampleRate: options.tracesSampleRate ?? 0.1,
    beforeSend: (event: SentryEventLike) => scrubSentryEvent(event),
    beforeBreadcrumb: (crumb: Record<string, unknown>) => {
      const { data, ...rest } = crumb;
      if (data && typeof data === 'object') {
        return {
          ...rest,
          data: scrubSentryEvent({ extra: data as Record<string, unknown> }).extra,
        };
      }
      return crumb;
    },
  };
  if (options.process === 'renderer') {
    config['replaysSessionSampleRate'] = options.replaysSessionSampleRate ?? 0.05;
    config['replaysOnErrorSampleRate'] = options.replaysOnErrorSampleRate ?? 1.0;
  }

  mod.init(config);
  log.info({ process: options.process, release: options.release }, 'sentry initialized');

  return {
    close: async () => {
      try {
        await mod.close(2000);
      } catch (err) {
        log.warn({ err }, 'sentry close failed');
      }
    },
    setUser: (user) => mod.setUser(user),
    setTag: (k, v) => mod.setTag(k, v),
  };
}

async function loadSentryModule(processType: SentryProcess): Promise<SentryClientModule> {
  const specifier = resolveSpecifier(processType);
  return (await import(/* @vite-ignore */ specifier)) as SentryClientModule;
}

function resolveSpecifier(processType: SentryProcess): string {
  if (processType === 'main') return '@sentry/electron/main';
  if (processType === 'renderer') return '@sentry/electron/renderer';
  return '@sentry/node';
}
