/**
 * Hub interno de re-auth pedido pelo backend. Outros módulos do main (ex.:
 * detector de token revogado, listener de erro 401) chamam `notify` para
 * acordar todos os handlers subscritos. Renderer subscreve via
 * `auth.managedLoginRequired` (subscription tRPC).
 *
 * Não estende `DisposableBase`: o hub mantém só um `Set<handler>` in-memory
 * sem timers/listeners externos. Subscribers retornam `IDisposable` próprio
 * via `subscribe()` que removem do Set quando descartados pelo tRPC. Quando
 * o `auth-runtime` é descartado o hub vira lixo coletável naturalmente —
 * sem recurso externo a liberar.
 */

import type { IDisposable } from '@g4os/kernel/disposable';

export interface ManagedLoginRequiredEvent {
  readonly reason: string;
}

export type ManagedLoginRequiredHandler = (event: ManagedLoginRequiredEvent) => void;

export class ManagedLoginRequiredHub {
  private readonly handlers = new Set<ManagedLoginRequiredHandler>();

  subscribe(handler: ManagedLoginRequiredHandler): IDisposable {
    this.handlers.add(handler);
    return { dispose: () => this.handlers.delete(handler) };
  }

  notify(reason: string): void {
    for (const h of this.handlers) {
      try {
        h({ reason });
      } catch {
        /* ignore handler-side errors */
      }
    }
  }
}
