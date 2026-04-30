/**
 * Renderer-side Sentry init.
 *
 * Mesmo `initSentry` do `@g4os/observability/sentry` que o main usa, com
 * `process: 'renderer'` — o pacote faz `await import('@sentry/electron/renderer')`
 * lazy. Sem DSN, retorna NOOP handle e não baixa o SDK.
 *
 * DSN/environment/release vêm como constantes Vite (`__G4OS_SENTRY_*__`)
 * injetadas em build time. Mesma estratégia das constantes Supabase já
 * existentes em `electron.vite.config.ts`.
 *
 * **Quando chamar:** o mais cedo possível em `main.tsx`, antes de
 * `createRoot().render()`. Erros que ocorrem durante init de providers
 * (TranslateProvider, ThemeProvider, RouterProvider) já passam pelo
 * handler global instalado pelo SDK.
 *
 * **Não intencional ainda:**
 * - Trace propagation tRPC ↔ OTel main: sub-task futura (precisa middleware
 *   no client + extração no server).
 *
 * **Implementado em sub-tasks:**
 * - Web Vitals via `PerformanceObserver` API (sem nova dep).
 * - `setUser` quando auth estabiliza (`updateRendererSentryUser`).
 */

import { initSentry, type SentryHandle } from '@g4os/observability/sentry';

declare const __G4OS_SENTRY_DSN__: string | undefined;
declare const __G4OS_SENTRY_ENVIRONMENT__: string | undefined;
declare const __G4OS_SENTRY_RELEASE__: string | undefined;

/**
 * Cache do handle entre HMR — evita reinit em hot reload do renderer.
 * Em prod, módulo é carregado uma vez então não importa.
 */
let cachedHandle: SentryHandle | null = null;

export async function initRendererSentry(): Promise<SentryHandle> {
  if (cachedHandle) return cachedHandle;

  const dsn = typeof __G4OS_SENTRY_DSN__ === 'string' ? __G4OS_SENTRY_DSN__ : undefined;
  const environment =
    typeof __G4OS_SENTRY_ENVIRONMENT__ === 'string' && __G4OS_SENTRY_ENVIRONMENT__.length > 0
      ? __G4OS_SENTRY_ENVIRONMENT__
      : 'development';
  const release =
    typeof __G4OS_SENTRY_RELEASE__ === 'string' && __G4OS_SENTRY_RELEASE__.length > 0
      ? __G4OS_SENTRY_RELEASE__
      : '0.0.0';

  cachedHandle = await initSentry({
    dsn,
    release,
    environment,
    process: 'renderer',
  });
  return cachedHandle;
}

/**
 * Captura exceção via Sentry SDK do renderer. Dynamic import direto do
 * `@sentry/electron/renderer` — `initSentry` já populou o estado global,
 * então `captureException` funciona sem state local.
 *
 * Sem DSN configurado, o SDK não foi inicializado — `import` falha
 * gracioso e a função vira no-op.
 */
export async function reportRendererException(
  error: unknown,
  context?: Readonly<Record<string, unknown>>,
): Promise<void> {
  try {
    const specifier = '@sentry/electron/renderer';
    const mod = (await import(/* @vite-ignore */ specifier)) as {
      captureException(err: unknown, extra?: Record<string, unknown>): void;
    };
    mod.captureException(error, context ? { extra: { ...context } } : undefined);
  } catch {
    // SDK indisponivel (dev sem DSN, build sem dep) — silencioso.
  }
}

/**
 * Propaga identidade do user para Sentry quando auth estabiliza
 * (state `authenticated`). Caller passa `null` em logout para limpar.
 */
export function updateRendererSentryUser(user: { id: string; email?: string } | null): void {
  try {
    const handle = cachedHandle;
    if (!handle) return;
    handle.setUser(user);
  } catch {
    // Falha de setUser é cosmética — Sentry continua reportando sem user.
  }
}

/**
 * Reporta Web Vitals (LCP, CLS, INP) via `PerformanceObserver` nativo.
 * Métricas enviam como mensagem `web-vital.<name>` com extra `{ value }`
 * — Sentry agrupa naturalmente.
 */
export function startWebVitalsReporting(): () => void {
  const observers: PerformanceObserver[] = [];

  const tryObserve = (entryType: string, handler: (entries: PerformanceEntry[]) => void): void => {
    try {
      const obs = new PerformanceObserver((list) => handler(list.getEntries()));
      obs.observe({ type: entryType, buffered: true } as never);
      observers.push(obs);
    } catch {
      // Tipo não suportado pelo browser/Electron version atual.
    }
  };

  // LCP — pega o último entry "largest-contentful-paint".
  tryObserve('largest-contentful-paint', (entries) => {
    const last = entries[entries.length - 1];
    if (!last) return;
    void reportWebVitalMessage('lcp', last.startTime);
  });

  // CLS — soma layout shifts não-induzidos pelo user.
  let clsValue = 0;
  tryObserve('layout-shift', (entries) => {
    for (const entry of entries) {
      const shift = entry as unknown as { value: number; hadRecentInput?: boolean };
      if (!shift.hadRecentInput) clsValue += shift.value;
    }
    void reportWebVitalMessage('cls', clsValue);
  });

  // INP — Interaction to Next Paint via `event` entries (browser >= Chrome 121).
  tryObserve('event', (entries) => {
    for (const entry of entries) {
      const ev = entry as unknown as { duration: number; interactionId?: number };
      if (ev.interactionId && ev.duration > 40) {
        void reportWebVitalMessage('inp', ev.duration);
      }
    }
  });

  return () => {
    for (const obs of observers) obs.disconnect();
  };
}

async function reportWebVitalMessage(name: string, value: number): Promise<void> {
  try {
    const specifier = '@sentry/electron/renderer';
    const mod = (await import(/* @vite-ignore */ specifier)) as {
      captureMessage(
        msg: string,
        options?: { level?: string; extra?: Record<string, unknown> },
      ): void;
    };
    mod.captureMessage(`web-vital.${name}`, { level: 'info', extra: { value } });
  } catch {
    // SDK indisponível — silencioso.
  }
}
