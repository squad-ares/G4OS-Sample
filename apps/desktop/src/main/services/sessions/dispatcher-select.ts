/**
 * Helper para escolher qual `TurnDispatcher` (in-process) vs.
 * `WorkerTurnDispatcher` (utilityProcess-backed) deve rodar o turn atual.
 * Extraído de `sessions-service.ts` para manter o arquivo ≤ 300 LOC.
 */

import type { TurnDispatcher } from '../turn-dispatcher.ts';
import type { WorkerTurnDispatcher } from '../worker-turn-dispatcher.ts';

export type AnyTurnDispatcher = TurnDispatcher | WorkerTurnDispatcher;

export interface DispatcherSelection {
  readonly turnDispatcher: TurnDispatcher;
  readonly workerTurnDispatcher?: WorkerTurnDispatcher;
  readonly useSessionWorker?: boolean;
}

export function selectDispatcher(deps: DispatcherSelection): AnyTurnDispatcher {
  if (deps.useSessionWorker === true && deps.workerTurnDispatcher) {
    return deps.workerTurnDispatcher;
  }
  return deps.turnDispatcher;
}
