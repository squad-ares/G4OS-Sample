/**
 * DebugHudAggregator — coleta métricas de subsystems do main e empurra
 * snapshot consolidado a 1Hz para qualquer BrowserWindow do HUD.
 *
 * Decisões de design:
 *   - Auto-pausa quando não há subscribers — zero overhead com HUD fechado.
 *   - Throttle 1Hz fixo via `setInterval`.
 *   - `dispose()` limpa timer + subscribers (DisposableBase).
 *
 * Cards consumem o snapshot via `window.debugHud.subscribe('snapshot', ...)`.
 * Versão atual cobre `memory`, `listeners`, `logs`.
 * Outros cards (IPC/vault/sessions) entram aqui em tasks dedicadas.
 *
 * Para `listeners`, o aggregator aceita um `ListenerLeakDetector` injetado
 * (vem do `observability-runtime`). Sem ele, o snapshot expõe valores
 * zerados — UI mostra placeholder em vez de quebrar.
 *
 * Para `logs`, o aggregator subscreve no `logStream` global do
 * `@g4os/kernel/logger` quando o primeiro consumer chega, e mantém um
 * ring buffer de até 1000 lines. Auto-unsubscribe ao stop. O `LogStream`
 * tem fast-path quando sem subscribers, então logger calls fora do HUD
 * pagam zero overhead.
 */

import { DisposableBase, type IDisposable, toDisposable } from '@g4os/kernel/disposable';
import { type LogStreamLine, logStream } from '@g4os/kernel/logger';
import { ipcMetrics } from '@g4os/observability/ipc';
import type { ListenerLeakDetector, ListenerLeakSnapshot } from '@g4os/observability/memory';
import type {
  ActiveSessionRow,
  HudSnapshot,
  MemorySample,
  ProcessTreeSnapshot,
  SessionsSnapshot,
  VaultActivity,
  VaultSnapshot,
} from '../../debug-hud-types.ts';

// Re-exporta para callers que dependem deste módulo por nome histórico.
export type {
  ActiveSessionRow,
  HudSnapshot,
  LogsSnapshot,
  MemorySample,
  MemorySnapshot,
  ProcessNodeSnapshot,
  ProcessTreeSnapshot,
  SessionsSnapshot,
  VaultActivity,
  VaultSnapshot,
} from '../../debug-hud-types.ts';

/**
 * Contrato mínimo do `TurnDispatcher` que o aggregator usa.
 * Em vez de importar `TurnDispatcher` direto (poderia introduzir ciclo
 * de import), exigimos só `snapshotActive()` — implementação ficou no
 * dispatcher.
 */
export interface ActiveTurnsProvider {
  snapshotActive(): readonly ActiveSessionRow[];
}

const HISTORY_LIMIT = 300;
const LOG_RING_LIMIT = 1000;
const TICK_MS = 1000;
const VAULT_COMPONENTS = new Set(['credential-vault', 'credential-rotation']);
const VAULT_RECENT_ERRORS_MAX = 5;
const VAULT_OPS_WINDOW_MS = 60_000;

const EMPTY_LISTENERS: ListenerLeakSnapshot = {
  total: 0,
  byEvent: [],
  stale: [],
};

export interface DebugHudAggregatorOptions {
  /** Detector injetado pelo `observability-runtime`; sem ele, snapshot vai zerado. */
  readonly listenerDetector?: ListenerLeakDetector;
  /** TurnDispatcher injetado para listar turnos ativos. */
  readonly activeTurnsProvider?: ActiveTurnsProvider;
}

export class DebugHudAggregator extends DisposableBase {
  private readonly history: MemorySample[] = [];
  private readonly logRing: LogStreamLine[] = [];
  private logsTotalSeen = 0;
  private logUnsubscribe: (() => void) | null = null;
  private readonly subscribers = new Set<(snapshot: HudSnapshot) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;

  // Estado vault derivado do LogStream filtrado por
  // `component in VAULT_COMPONENTS`. Não é fonte de verdade — é projeção
  // observacional. Reset quando o aggregator para.
  private vaultLastActivity: VaultActivity | undefined;
  private readonly vaultRecentErrors: VaultActivity[] = [];
  /** Janela rolling 60s de timestamps. Cleanup feito em cada tick. */
  private readonly vaultOpsWindow: { readonly ts: number; readonly isError: boolean }[] = [];

  constructor(private readonly options: DebugHudAggregatorOptions = {}) {
    super();
  }

  subscribe(handler: (snapshot: HudSnapshot) => void): IDisposable {
    this.subscribers.add(handler);
    if (this.subscribers.size === 1 && this.timer === null) this.start();
    return toDisposable(() => {
      this.subscribers.delete(handler);
      if (this.subscribers.size === 0) this.stop();
    });
  }

  override dispose(): void {
    if (this._disposed) return;
    this.stop();
    this.subscribers.clear();
    super.dispose();
  }

  /**
   * Esvazia o ring buffer de logs do HUD. Não toca em arquivos
   * persistidos (`app.log` / `error.log` via pino-roll seguem intactos).
   * O contador `logsTotalSeen` é mantido pra preservar a métrica histórica.
   */
  clearLogBuffer(): void {
    this.logRing.length = 0;
  }

  private start(): void {
    this.logUnsubscribe = logStream.subscribe((line) => {
      this.logsTotalSeen += 1;
      this.logRing.push(line);
      if (this.logRing.length > LOG_RING_LIMIT) this.logRing.shift();
      this.observeVault(line);
    });
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  private stop(): void {
    if (this.logUnsubscribe) {
      this.logUnsubscribe();
      this.logUnsubscribe = null;
    }
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    // Reset projeção vault para evitar mostrar dados antigos quando HUD reabre.
    this.vaultLastActivity = undefined;
    this.vaultRecentErrors.length = 0;
    this.vaultOpsWindow.length = 0;
  }

  /**
   * Filtra log lines de credential-vault / credential-rotation
   * e projeta em estado de vault. Errors entram em `recentErrors` (capped),
   * todas operações entram em `vaultOpsWindow` para o rolling 60s.
   */
  private observeVault(line: LogStreamLine): void {
    if (!VAULT_COMPONENTS.has(line.component)) return;
    const key = typeof line.ctx?.['key'] === 'string' ? (line.ctx['key'] as string) : undefined;
    const activity: VaultActivity = {
      ts: line.time,
      level: line.level,
      key,
      msg: line.msg,
    };
    this.vaultLastActivity = activity;
    const isError = line.level === 'warn' || line.level === 'error' || line.level === 'fatal';
    if (isError) {
      this.vaultRecentErrors.push(activity);
      if (this.vaultRecentErrors.length > VAULT_RECENT_ERRORS_MAX) {
        this.vaultRecentErrors.shift();
      }
    }
    this.vaultOpsWindow.push({ ts: line.time, isError });
  }

  /**
   * Snapshot da árvore de processos. Em V2 (ADR-0145) o
   * worker-per-session foi removido, então só o main aparece. Quando/se
   * a decisão for revertida ou um supervisor for adicionado, o
   * aggregator deve receber via DI mais um provider de subprocess
   * info (mesmo padrão do `activeTurnsProvider`).
   */
  private buildProcessTreeSnapshot(sample: MemorySample): ProcessTreeSnapshot {
    return {
      nodes: [
        {
          kind: 'main',
          pid: process.pid,
          label: '@g4os/desktop main',
          rssBytes: sample.rss,
          heapUsedBytes: sample.heapUsed,
          uptimeMs: Math.round(process.uptime() * 1000),
        },
      ],
    };
  }

  /** Lê snapshot do TurnDispatcher injetado. */
  private buildSessionsSnapshot(): SessionsSnapshot {
    const provider = this.options.activeTurnsProvider;
    const active = provider ? provider.snapshotActive() : [];
    return {
      activeCount: active.length,
      active: [...active],
    };
  }

  private buildVaultSnapshot(now: number): VaultSnapshot {
    const cutoff = now - VAULT_OPS_WINDOW_MS;
    while (this.vaultOpsWindow.length > 0 && (this.vaultOpsWindow[0]?.ts ?? 0) < cutoff) {
      this.vaultOpsWindow.shift();
    }
    let ops = 0;
    let errors = 0;
    for (const op of this.vaultOpsWindow) {
      ops += 1;
      if (op.isError) errors += 1;
    }
    return {
      lastActivity: this.vaultLastActivity,
      recentErrors: [...this.vaultRecentErrors],
      counts60s: { ops, errors },
    };
  }

  private tick(): void {
    const sample = takeMemorySample();
    this.history.push(sample);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();

    const listeners = this.options.listenerDetector
      ? this.options.listenerDetector.snapshot()
      : EMPTY_LISTENERS;

    const snapshot: HudSnapshot = {
      ts: sample.ts,
      memory: {
        current: sample,
        history: [...this.history],
        growthRateBytesPerSec: linearGrowthRate(this.history),
      },
      listeners,
      logs: {
        recent: [...this.logRing],
        totalSeen: this.logsTotalSeen,
      },
      vault: this.buildVaultSnapshot(sample.ts),
      ipc: ipcMetrics.snapshot(sample.ts),
      processTree: this.buildProcessTreeSnapshot(sample),
      sessions: this.buildSessionsSnapshot(),
    };
    for (const subscriber of this.subscribers) {
      try {
        subscriber(snapshot);
      } catch {
        // Subscriber malformado nao pode interromper o tick.
      }
    }
  }
}

function takeMemorySample(): MemorySample {
  const usage = process.memoryUsage();
  return {
    ts: Date.now(),
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss,
  };
}

function linearGrowthRate(samples: readonly MemorySample[]): number {
  if (samples.length < 10) return 0;
  // Janela de 60s (60 samples a 1Hz)
  const window = samples.slice(-60);
  const xs = window.map((s) => s.ts / 1000);
  const ys = window.map((s) => s.heapUsed);
  const n = xs.length;
  let meanX = 0;
  let meanY = 0;
  for (let i = 0; i < n; i++) {
    meanX += xs[i] ?? 0;
    meanY += ys[i] ?? 0;
  }
  meanX /= n;
  meanY /= n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = (xs[i] ?? 0) - meanX;
    num += dx * ((ys[i] ?? 0) - meanY);
    den += dx * dx;
  }
  return den === 0 ? 0 : num / den;
}
