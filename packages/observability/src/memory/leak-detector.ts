export interface TrackedListener {
  readonly event: string;
  readonly handler: (...args: readonly unknown[]) => unknown;
  readonly addedAt: number;
  readonly stack: string;
}

export interface StaleListener extends TrackedListener {
  readonly target: object;
  readonly ageMs: number;
}

export interface ListenerLeakDetectorOptions {
  readonly now?: () => number;
}

export class ListenerLeakDetector {
  private readonly tracked = new WeakMap<object, Set<TrackedListener>>();
  private readonly allTargets = new Set<WeakRef<object>>();
  private readonly now: () => number;

  constructor(options: ListenerLeakDetectorOptions = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  track(target: object, event: string, handler: (...args: readonly unknown[]) => unknown): void {
    const entry: TrackedListener = {
      event,
      handler,
      addedAt: this.now(),
      stack: new Error('listener-tracked').stack ?? '',
    };
    let set = this.tracked.get(target);
    if (!set) {
      set = new Set();
      this.tracked.set(target, set);
      this.allTargets.add(new WeakRef(target));
    }
    set.add(entry);
  }

  untrack(target: object, event: string, handler: (...args: readonly unknown[]) => unknown): void {
    const set = this.tracked.get(target);
    if (!set) return;
    for (const entry of set) {
      if (entry.event === event && entry.handler === handler) {
        set.delete(entry);
        return;
      }
    }
  }

  reportStale(maxAgeMs = 60_000): StaleListener[] {
    const now = this.now();
    const stale: StaleListener[] = [];
    for (const ref of this.allTargets) {
      const target = ref.deref();
      if (!target) {
        this.allTargets.delete(ref);
        continue;
      }
      const set = this.tracked.get(target);
      if (!set) continue;
      for (const entry of set) {
        const ageMs = now - entry.addedAt;
        if (ageMs > maxAgeMs) {
          stale.push({ ...entry, target, ageMs });
        }
      }
    }
    return stale;
  }

  countFor(target: object, event?: string): number {
    const set = this.tracked.get(target);
    if (!set) return 0;
    if (!event) return set.size;
    let count = 0;
    for (const entry of set) {
      if (entry.event === event) count++;
    }
    return count;
  }

  /**
   * Snapshot agregado para o Debug HUD.
   *
   * Itera todos os targets vivos (`WeakRef.deref()` válido) e agrupa
   * tracked listeners por nome de evento. Limpa refs mortas em passada
   * — efeito colateral controlado, mantém `allTargets` enxuto.
   *
   * `staleMs` define o threshold de "velho" (delegado a `reportStale`).
   * Stack de cada stale entrada vai junto pra UI mostrar onde foi criado.
   */
  snapshot(staleMs = 60_000): ListenerLeakSnapshot {
    let total = 0;
    const byEvent = new Map<string, number>();
    for (const ref of this.allTargets) {
      const target = ref.deref();
      if (!target) {
        this.allTargets.delete(ref);
        continue;
      }
      const set = this.tracked.get(target);
      if (!set) continue;
      total += set.size;
      for (const entry of set) {
        byEvent.set(entry.event, (byEvent.get(entry.event) ?? 0) + 1);
      }
    }

    const sortedEvents = Array.from(byEvent.entries())
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count);

    const stale = this.reportStale(staleMs).map((entry) => ({
      event: entry.event,
      ageMs: entry.ageMs,
      stackPreview: firstStackFrames(entry.stack, 4),
    }));

    return { total, byEvent: sortedEvents, stale };
  }
}

export interface ListenerLeakSnapshot {
  /** Total de listeners ativos somando todos os targets vivos. */
  readonly total: number;
  /** Top events ordenados por count desc. */
  readonly byEvent: readonly { readonly event: string; readonly count: number }[];
  /** Listeners velhos para inspeção. Stack truncada para fit no UI. */
  readonly stale: readonly {
    readonly event: string;
    readonly ageMs: number;
    readonly stackPreview: string;
  }[];
}

function firstStackFrames(stack: string, n: number): string {
  return stack
    .split('\n')
    .slice(0, n + 1)
    .join('\n');
}
