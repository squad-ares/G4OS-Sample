/**
 * PostHog product telemetry — wrapper opt-in com privacy-by-default.
 *
 * Distintos do Sentry (crash reporting) e do OTel (tracing). PostHog é
 * sobre eventos de produto: feature usage, retention, funil de
 * onboarding, conversão. Anônimo por design — sem userId, sem email,
 * só `distinctId` aleatório por instalação.
 *
 * Privacy gates:
 * 1. **Opt-out por default.** Sem `consent === 'granted'`, init retorna
 *    NOOP e nenhum dado sai do device.
 * 2. **No PII.** `distinctId` é UUID v4 minted no primeiro consent grant
 *    e persistido localmente. Nunca passa email/userId/path.
 * 3. **Lazy load.** Sem `consent` ou sem `apiKey`, dep `posthog-node` não
 *    é nem importada — bundle não cresce, headless/web continuam OK.
 *
 * Eventos passam por `events.ts` (catálogo tipado) — string literal não
 * compila. Mantém o que sai do app rastreável e revisável em diff.
 */

import { createLogger } from '@g4os/kernel/logger';

const log = createLogger('observability:posthog');

export type PostHogConsent = 'granted' | 'denied' | 'unknown';

export interface PostHogInitOptions {
  readonly apiKey: string | undefined;
  readonly host?: string;
  readonly distinctId: string;
  readonly consent: PostHogConsent;
  readonly release: string;
  readonly environment: string;
}

export interface PostHogHandle {
  capture(event: string, properties?: Record<string, unknown>): void;
  identify(props: Record<string, unknown>): void;
  shutdown(): Promise<void>;
}

const NOOP_HANDLE: PostHogHandle = {
  capture: () => undefined,
  identify: () => undefined,
  shutdown: () => Promise.resolve(),
};

interface PostHogClientModule {
  PostHog: new (
    apiKey: string,
    options?: { host?: string; flushAt?: number; flushInterval?: number },
  ) => {
    capture(args: {
      distinctId: string;
      event: string;
      properties?: Record<string, unknown>;
    }): void;
    identify(args: { distinctId: string; properties?: Record<string, unknown> }): void;
    shutdown(): Promise<void>;
  };
}

export async function initPostHog(options: PostHogInitOptions): Promise<PostHogHandle> {
  if (options.consent !== 'granted') {
    log.info({ consent: options.consent }, 'posthog disabled (no consent); returning noop');
    return NOOP_HANDLE;
  }
  if (!options.apiKey) {
    log.info('posthog disabled (no api key); returning noop');
    return NOOP_HANDLE;
  }

  const mod = await loadPostHogModule();
  if (!mod) {
    log.warn('posthog dep not installed; returning noop');
    return NOOP_HANDLE;
  }

  const client = new mod.PostHog(options.apiKey, {
    ...(options.host ? { host: options.host } : {}),
    flushAt: 20,
    flushInterval: 10_000,
  });

  // Identify de boot — anexa release/env ao distinctId. Nunca anexar
  // userId/email aqui (PII).
  client.identify({
    distinctId: options.distinctId,
    properties: {
      release: options.release,
      environment: options.environment,
    },
  });

  log.info({ release: options.release, environment: options.environment }, 'posthog initialized');

  return {
    capture: (event, properties) => {
      try {
        client.capture({
          distinctId: options.distinctId,
          event,
          ...(properties ? { properties } : {}),
        });
      } catch (cause) {
        log.warn({ err: cause, event }, 'posthog capture failed');
      }
    },
    identify: (properties) => {
      try {
        client.identify({ distinctId: options.distinctId, properties });
      } catch (cause) {
        log.warn({ err: cause }, 'posthog identify failed');
      }
    },
    shutdown: async () => {
      try {
        await client.shutdown();
      } catch (cause) {
        log.warn({ err: cause }, 'posthog shutdown failed');
      }
    },
  };
}

async function loadPostHogModule(): Promise<PostHogClientModule | null> {
  try {
    // Specifier opaco pra Vite/TS não tentar resolver no compile time —
    // posthog-node é dep opcional carregada só quando há consent.
    const specifier = 'posthog-node';
    return (await import(/* @vite-ignore */ specifier)) as PostHogClientModule;
  } catch {
    return null;
  }
}
