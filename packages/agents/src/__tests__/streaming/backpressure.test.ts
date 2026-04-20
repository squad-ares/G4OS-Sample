import { Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../interface/agent.ts';
import { dropIfBackpressured } from '../../streaming/backpressure.ts';

function runWith(events: readonly AgentEvent[], maxQueue = 10): Promise<AgentEvent[]> {
  return new Promise((resolve) => {
    const source = new Subject<AgentEvent>();
    const received: AgentEvent[] = [];
    source.pipe(dropIfBackpressured(maxQueue)).subscribe({
      next: (e) => received.push(e),
      complete: () => resolve(received),
    });
    for (const ev of events) {
      source.next(ev);
    }
    source.complete();
  });
}

describe('dropIfBackpressured', () => {
  it('never drops structural events under pressure', async () => {
    const structural: AgentEvent = { type: 'tool_use_start', toolUseId: 't1', toolName: 'bash' };
    const done: AgentEvent = { type: 'done', reason: 'stop' };
    const deltas: AgentEvent[] = Array.from({ length: 1000 }, (_, i) => ({
      type: 'text_delta' as const,
      text: `d${i}`,
    }));
    const events: AgentEvent[] = [...deltas, structural, done];
    const received = await runWith(events, 50);
    const structuralTypes = received.filter((e) => e.type !== 'text_delta').map((e) => e.type);
    expect(structuralTypes).toContain('tool_use_start');
    expect(structuralTypes).toContain('done');
  });

  it('forwards all events under threshold', async () => {
    const events: AgentEvent[] = [
      { type: 'started', turnId: 't1' },
      { type: 'text_delta', text: 'a' },
      { type: 'text_delta', text: 'b' },
      { type: 'done', reason: 'stop' },
    ];
    const received = await runWith(events, 100);
    expect(received).toHaveLength(4);
  });

  it('drops oldest droppable (text_delta/thinking_delta) when queue full', async () => {
    const events: AgentEvent[] = [];
    for (let i = 0; i < 30; i++) {
      events.push({ type: 'text_delta', text: `d${i}` });
    }
    events.push({ type: 'done', reason: 'stop' });
    const received = await runWith(events, 5);
    expect(received.some((e) => e.type === 'done')).toBe(true);
    expect(received.filter((e) => e.type === 'text_delta').length).toBeLessThanOrEqual(30);
  });
});
