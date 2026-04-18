import type { IDisposable } from './types.ts';

export class DisposableStore implements IDisposable {
  private _isDisposed = false;
  private readonly _toDispose = new Set<IDisposable>();

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  add<T extends IDisposable>(disposable: T): T {
    if (this._isDisposed) {
      // Auto-dispose para evitar recursos órfãos
      try {
        disposable.dispose();
      } catch {
        //ignore
      }
      throw new Error('DisposableStore already disposed — cannot add');
    }
    this._toDispose.add(disposable);
    return disposable;
  }

  /** Remove um disposable sem descartar (caller assume responsabilidade) */
  delete(disposable: IDisposable): boolean {
    return this._toDispose.delete(disposable);
  }

  /** Descarta recurso especifico imediatamente */
  deleteAndDispose(disposable: IDisposable): void {
    if (this._toDispose.delete(disposable)) {
      disposable.dispose();
    }
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;

    const errors: unknown[] = [];
    for (const d of this._toDispose) {
      try {
        d.dispose();
      } catch (err) {
        errors.push(err);
      }
    }
    this._toDispose.clear();

    if (errors.length === 1) throw errors[0];

    if (errors.length > 1)
      throw new AggregateError(errors, `Multiple errors while disposing (${errors.length})`);
  }
}
