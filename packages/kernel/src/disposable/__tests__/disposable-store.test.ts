import { describe, expect, it, vi } from 'vitest';
import {
  bindToAbort,
  combinedDisposable,
  DisposableBase,
  DisposableStore,
  toDisposable,
} from '../index.ts';

describe('DisposableStore', () => {
  it('disposes all registered items once', () => {
    const store = new DisposableStore();
    const dispose1 = vi.fn();
    const dispose2 = vi.fn();
    store.add(toDisposable(dispose1));
    store.add(toDisposable(dispose2));

    store.dispose();
    expect(dispose1).toHaveBeenCalledOnce();
    expect(dispose2).toHaveBeenCalledOnce();

    store.dispose(); // idempotent
    expect(dispose1).toHaveBeenCalledOnce();
  });

  it('isDisposed reflects state', () => {
    const store = new DisposableStore();
    expect(store.isDisposed).toBe(false);
    store.dispose();
    expect(store.isDisposed).toBe(true);
  });

  it('throws AggregateError on multiple failures', () => {
    const store = new DisposableStore();
    store.add(
      toDisposable(() => {
        throw new Error('A');
      }),
    );
    store.add(
      toDisposable(() => {
        throw new Error('B');
      }),
    );
    expect(() => store.dispose()).toThrow(AggregateError);
  });

  it('throws single error (not AggregateError) on one failure', () => {
    const store = new DisposableStore();
    store.add(
      toDisposable(() => {
        throw new Error('solo');
      }),
    );
    expect(() => store.dispose()).toThrow('solo');
  });

  it('auto-disposes and throws when adding to disposed store', () => {
    const store = new DisposableStore();
    store.dispose();
    const dispose = vi.fn();
    expect(() => store.add(toDisposable(dispose))).toThrow();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('delete removes item without disposing it', () => {
    const store = new DisposableStore();
    const dispose = vi.fn();
    const item = toDisposable(dispose);
    store.add(item);
    const removed = store.delete(item);
    expect(removed).toBe(true);
    store.dispose();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('delete returns false for unknown item', () => {
    const store = new DisposableStore();
    expect(store.delete(toDisposable(() => undefined))).toBe(false);
  });

  it('deleteAndDispose removes and disposes immediately', () => {
    const store = new DisposableStore();
    const dispose = vi.fn();
    const item = toDisposable(dispose);
    store.add(item);
    store.deleteAndDispose(item);
    expect(dispose).toHaveBeenCalledOnce();
    store.dispose();
    expect(dispose).toHaveBeenCalledOnce(); // not called again
  });

  it('deleteAndDispose is a no-op for unknown item', () => {
    const store = new DisposableStore();
    const dispose = vi.fn();
    store.deleteAndDispose(toDisposable(dispose));
    expect(dispose).not.toHaveBeenCalled();
  });
});

describe('toDisposable', () => {
  it('calls fn on dispose', () => {
    const fn = vi.fn();
    const d = toDisposable(fn);
    d.dispose();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('is idempotent — fn called only once', () => {
    const fn = vi.fn();
    const d = toDisposable(fn);
    d.dispose();
    d.dispose();
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe('combinedDisposable', () => {
  it('disposes all children', () => {
    const a = vi.fn();
    const b = vi.fn();
    const combined = combinedDisposable(toDisposable(a), toDisposable(b));
    combined.dispose();
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('continues disposing remaining children after error', () => {
    const b = vi.fn();
    const combined = combinedDisposable(
      toDisposable(() => {
        throw new Error('fail');
      }),
      toDisposable(b),
    );
    combined.dispose(); // best-effort, no throw
    expect(b).toHaveBeenCalledOnce();
  });
});

describe('bindToAbort', () => {
  it('disposes when signal aborts', () => {
    const ctrl = new AbortController();
    const dispose = vi.fn();
    bindToAbort(toDisposable(dispose), ctrl.signal);
    expect(dispose).not.toHaveBeenCalled();
    ctrl.abort();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('disposes immediately if signal already aborted', () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const dispose = vi.fn();
    bindToAbort(toDisposable(dispose), ctrl.signal);
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('cleanup removes abort listener on explicit dispose', () => {
    const ctrl = new AbortController();
    const dispose = vi.fn();
    const bound = bindToAbort(toDisposable(dispose), ctrl.signal);
    bound.dispose();
    ctrl.abort();
    expect(dispose).toHaveBeenCalledOnce(); // called by bound.dispose, not again on abort
  });
});

describe('DisposableBase', () => {
  it('subclass can register and dispose resources', () => {
    const cleanup = vi.fn();

    class TestComponent extends DisposableBase {
      constructor() {
        super();
        this._register(toDisposable(cleanup));
      }
    }

    const comp = new TestComponent();
    expect(comp._disposed).toBe(false);
    comp.dispose();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(comp._disposed).toBe(true);
  });

  it('dispose is idempotent', () => {
    const cleanup = vi.fn();

    class TestComponent extends DisposableBase {
      constructor() {
        super();
        this._register(toDisposable(cleanup));
      }
    }

    const comp = new TestComponent();
    comp.dispose();
    comp.dispose();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
