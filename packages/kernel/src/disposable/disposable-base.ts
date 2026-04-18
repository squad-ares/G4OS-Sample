import { DisposableStore } from './disposable-store.ts';
import type { IDisposable } from './types.ts';

/**
 * Classe base para qualquer objeto que gerencia recursos.
 * Subclasses usam `this._register(disposable)` e `dispose()` gratuitamente.
 */

export abstract class DisposableBase implements IDisposable {
  protected readonly _store = new DisposableStore();

  protected _register<T extends IDisposable>(d: T): T {
    return this._store.add(d);
  }

  protected get _disposed(): boolean {
    return this._store.isDisposed;
  }

  dispose(): void {
    this._store.dispose();
  }
}
