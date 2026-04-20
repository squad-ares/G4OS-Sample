import { Observable, type OperatorFunction } from 'rxjs';
import type { AgentEvent } from '../interface/agent.ts';

const DROPPABLE_TYPES: ReadonlySet<AgentEvent['type']> = new Set(['text_delta', 'thinking_delta']);

function isDroppable(event: AgentEvent): boolean {
  return DROPPABLE_TYPES.has(event.type);
}

export function dropIfBackpressured(maxQueueSize = 100): OperatorFunction<AgentEvent, AgentEvent> {
  return (source) =>
    new Observable<AgentEvent>((sub) => {
      const queue: AgentEvent[] = [];
      let draining = false;
      let sourceCompleted = false;

      const drain = async (): Promise<void> => {
        draining = true;
        while (queue.length > 0) {
          const item = queue.shift();
          if (item !== undefined) {
            sub.next(item);
          }
          await Promise.resolve();
        }
        draining = false;
        if (sourceCompleted) {
          sub.complete();
        }
      };

      const tryEnqueue = (item: AgentEvent): boolean => {
        if (queue.length < maxQueueSize) {
          queue.push(item);
          return true;
        }
        const idx = queue.findIndex(isDroppable);
        if (idx !== -1) {
          queue.splice(idx, 1);
          queue.push(item);
          return true;
        }
        if (isDroppable(item)) {
          return false;
        }
        queue.push(item);
        return true;
      };

      const subscription = source.subscribe({
        next: (item) => {
          if (!tryEnqueue(item)) {
            return;
          }
          if (!draining) {
            void drain();
          }
        },
        error: (err) => sub.error(err),
        complete: () => {
          sourceCompleted = true;
          if (!draining && queue.length === 0) {
            sub.complete();
          }
        },
      });

      return () => {
        subscription.unsubscribe();
        queue.length = 0;
      };
    });
}
