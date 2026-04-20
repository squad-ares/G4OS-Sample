import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { AgentEvent } from '../../interface/agent.ts';
import { batchTextDeltas } from '../../streaming/batch-deltas.ts';

function collect(ms = 20): {
  source: Subject<AgentEvent>;
  received: AgentEvent[];
  unsubscribe: () => void;
} {
  const source = new Subject<AgentEvent>();
  const received: AgentEvent[] = [];
  const sub = source.pipe(batchTextDeltas(ms)).subscribe({
    next: (e) => received.push(e),
  });
  return { source, received, unsubscribe: () => sub.unsubscribe() };
}

describe('batchTextDeltas', () => {
  it('coalesces adjacent text_delta events into a single batch', async () => {
    vi.useFakeTimers();
    const { source, received } = collect(16);
    source.next({ type: 'text_delta', text: 'hello ' });
    source.next({ type: 'text_delta', text: 'world' });
    await vi.advanceTimersByTimeAsync(20);
    expect(received).toEqual([{ type: 'text_delta', text: 'hello world' }]);
    vi.useRealTimers();
  });

  it('flushes buffer before emitting structural events', () => {
    vi.useFakeTimers();
    const { source, received } = collect(16);
    source.next({ type: 'text_delta', text: 'partial' });
    source.next({ type: 'tool_use_start', toolUseId: 't1', toolName: 'bash' });
    expect(received).toEqual([
      { type: 'text_delta', text: 'partial' },
      { type: 'tool_use_start', toolUseId: 't1', toolName: 'bash' },
    ]);
    vi.useRealTimers();
  });

  it('flushes remaining buffer on complete', () => {
    const { source, received } = collect(16);
    source.next({ type: 'text_delta', text: 'final' });
    source.complete();
    expect(received).toEqual([{ type: 'text_delta', text: 'final' }]);
  });

  it('clears timer on unsubscribe (no leaked flush)', () => {
    vi.useFakeTimers();
    const { source, received, unsubscribe } = collect(16);
    source.next({ type: 'text_delta', text: 'pending' });
    unsubscribe();
    vi.advanceTimersByTime(50);
    expect(received).toEqual([]);
    vi.useRealTimers();
  });
});
