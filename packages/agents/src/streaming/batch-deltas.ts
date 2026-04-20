import { Observable, type OperatorFunction } from 'rxjs';
import type { AgentEvent } from '../interface/agent.ts';

export function batchTextDeltas(intervalMs = 16): OperatorFunction<AgentEvent, AgentEvent> {
  return (source) =>
    new Observable<AgentEvent>((sub) => {
      let buffer = '';
      let flushTimer: ReturnType<typeof setTimeout> | null = null;

      const flushBuffer = (): void => {
        if (buffer.length > 0) {
          sub.next({ type: 'text_delta', text: buffer });
          buffer = '';
        }
        if (flushTimer !== null) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
      };

      const subscription = source.subscribe({
        next: (event) => {
          if (event.type !== 'text_delta') {
            flushBuffer();
            sub.next(event);
            return;
          }
          buffer += event.text;
          if (flushTimer === null) {
            flushTimer = setTimeout(flushBuffer, intervalMs);
          }
        },
        error: (err) => {
          flushBuffer();
          sub.error(err);
        },
        complete: () => {
          flushBuffer();
          sub.complete();
        },
      });

      return () => {
        subscription.unsubscribe();
        if (flushTimer !== null) {
          clearTimeout(flushTimer);
          flushTimer = null;
        }
      };
    });
}
