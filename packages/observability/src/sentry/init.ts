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

  // Lazy import com fallback NOOP se SDK falhar (dep ausente, versão
  // incompatível, bundle corrompido). Sem isso, erro borbulha do
  // dynamic import e mata main no boot.
  let mod: SentryClientModule;
  try {
    mod = await loadSentryModule(options.process);
  } catch (cause) {
    log.warn({ err: cause, process: options.process }, 'sentry SDK load failed; returning noop');
    return NOOP_HANDLE;
  }

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
  if (options.process === 'main') {
    // OTel SDK (NodeSDK) já registra o provider global de trace/context/propagation.
    // Sem skipOpenTelemetrySetup, @sentry/node 8.x tenta registrar o seu próprio
    // provider → "Attempted duplicate registration" nos logs do diag. Sentry segue
    // capturando erros/breadcrumbs; só o provider OTel redundante é desabilitado.
    config['skipOpenTelemetrySetup'] = true;
  }
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
  // Branches com string literal — Vite (renderer) precisa de specifier
  // estático pra pré-bundlar `@sentry/electron/renderer`. Versão anterior
  // usava `import(variável)` com `/* @vite-ignore */`, o que desativava
  // a resolução no Vite e o renderer falhava em runtime com
  // "Failed to resolve module specifier '@sentry/electron/renderer'".
  // Para main/worker, o tsup mantém os imports como external e o Node
  // resolve via require/import dinâmico normal.
  if (processType === 'renderer') {
    return (await import('@sentry/electron/renderer')) as unknown as SentryClientModule;
  }
  if (processType === 'main') {
    return (await import('@sentry/electron/main')) as unknown as SentryClientModule;
  }
  return (await import('@sentry/node')) as unknown as SentryClientModule;
}
