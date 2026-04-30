/**
 * Helpers para drain de turnos ativos no shutdown.
 *
 * Extraído do `TurnDispatcher` pra manter o composition root ≤ 300 LOC
 * (gate `check:main-size`). A lógica é simples mas tem tradeoffs sutis:
 * abort+await com deadline curto pra graceful-shutdown não pendurar.
 */

export interface DrainableTurn {
  readonly abortController: AbortController;
  readonly subscription: { unsubscribe(): void } | null;
  readonly completion: Promise<unknown>;
}

// Janela pra `runToolLoop` reagir ao AbortSignal antes do dispose final.
// Curta o suficiente pra não pendurar o quit (5s deadline total no AppLifecycle).
export const DEFAULT_TURN_DRAIN_DEADLINE_MS = 1_500;

export async function drainActiveTurns(
  active: ReadonlyMap<unknown, DrainableTurn>,
  deadlineMs: number = DEFAULT_TURN_DRAIN_DEADLINE_MS,
): Promise<void> {
  const completions: Promise<unknown>[] = [];
  for (const [, turn] of active) {
    turn.abortController.abort();
    turn.subscription?.unsubscribe();
    completions.push(turn.completion);
  }
  if (completions.length === 0) return;
  const deadline = new Promise<void>((resolve) => {
    const handle = setTimeout(resolve, deadlineMs);
    handle.unref?.();
  });
  await Promise.race([Promise.allSettled(completions), deadline]);
}
