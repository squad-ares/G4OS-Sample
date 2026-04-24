import { describe, expect, it, vi } from 'vitest';
import { type SessionBusEvent, SessionEventBus } from '../session-event-bus.ts';

function makeEvent(sessionId: string): SessionBusEvent {
  return { type: 'turn.started', sessionId, turnId: 't1' };
}

describe('SessionEventBus', () => {
  it('delivers events to subscribers of the target sessionId', () => {
    const bus = new SessionEventBus();
    const seen: SessionBusEvent[] = [];
    bus.subscribe('s1', (e) => seen.push(e));
    bus.emit('s1', makeEvent('s1'));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.type).toBe('turn.started');
    bus.dispose();
  });

  it('does not leak events across sessions', () => {
    const bus = new SessionEventBus();
    const onS1 = vi.fn();
    const onS2 = vi.fn();
    bus.subscribe('s1', onS1);
    bus.subscribe('s2', onS2);
    bus.emit('s1', makeEvent('s1'));
    expect(onS1).toHaveBeenCalledTimes(1);
    expect(onS2).not.toHaveBeenCalled();
    bus.dispose();
  });

  it('supports multiple subscribers per session', () => {
    const bus = new SessionEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe('s1', a);
    bus.subscribe('s1', b);
    expect(bus.listenerCount('s1')).toBe(2);
    bus.emit('s1', makeEvent('s1'));
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    bus.dispose();
  });

  it('unsubscribe removes the handler and cleans the map when empty', () => {
    const bus = new SessionEventBus();
    const handler = vi.fn();
    const sub = bus.subscribe('s1', handler);
    expect(bus.listenerCount('s1')).toBe(1);
    sub.dispose();
    expect(bus.listenerCount('s1')).toBe(0);
    bus.emit('s1', makeEvent('s1'));
    expect(handler).not.toHaveBeenCalled();
    bus.dispose();
  });

  it('isolates a handler throw — other subscribers still receive the event', () => {
    const bus = new SessionEventBus();
    const ok = vi.fn();
    bus.subscribe('s1', () => {
      throw new Error('boom');
    });
    bus.subscribe('s1', ok);
    bus.emit('s1', makeEvent('s1'));
    expect(ok).toHaveBeenCalledTimes(1);
    bus.dispose();
  });

  it('dispose clears all listeners', () => {
    const bus = new SessionEventBus();
    bus.subscribe('s1', vi.fn());
    bus.subscribe('s2', vi.fn());
    bus.dispose();
    expect(bus.listenerCount('s1')).toBe(0);
    expect(bus.listenerCount('s2')).toBe(0);
  });
});
