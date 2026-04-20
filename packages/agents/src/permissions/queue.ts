import type { IDisposable } from '@g4os/kernel/disposable';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import type { PermissionDecision, PermissionRequest } from './types.ts';

type Resolver = (decision: PermissionDecision) => void;
type Listener = (request: PermissionRequest) => void;

export class PermissionQueue extends DisposableBase {
  private readonly pending = new Map<string, Resolver>();
  private readonly listeners = new Set<Listener>();

  enqueue(request: PermissionRequest): Promise<PermissionDecision> {
    if (this._disposed) {
      return Promise.resolve({ type: 'deny', reason: 'queue_disposed' });
    }
    return new Promise<PermissionDecision>((resolve) => {
      this.pending.set(request.id, resolve);
      for (const listener of this.listeners) {
        listener(request);
      }
    });
  }

  decide(requestId: string, decision: PermissionDecision): boolean {
    const resolver = this.pending.get(requestId);
    if (resolver === undefined) {
      return false;
    }
    this.pending.delete(requestId);
    resolver(decision);
    return true;
  }

  onRequest(listener: Listener): IDisposable {
    this.listeners.add(listener);
    return toDisposable(() => {
      this.listeners.delete(listener);
    });
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  override dispose(): void {
    for (const resolver of this.pending.values()) {
      resolver({ type: 'deny', reason: 'queue_disposed' });
    }
    this.pending.clear();
    this.listeners.clear();
    super.dispose();
  }
}
