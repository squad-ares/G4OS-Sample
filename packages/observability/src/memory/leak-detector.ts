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
}
