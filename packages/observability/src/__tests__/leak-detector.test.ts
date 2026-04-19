import { describe, expect, it } from 'vitest';
import { ListenerLeakDetector } from '../memory/leak-detector.ts';

describe('ListenerLeakDetector', () => {
  it('tracks listeners per target and counts by event', () => {
    const detector = new ListenerLeakDetector();
    const target = {};
    const handlerA = (): void => undefined;
    const handlerB = (): void => undefined;

    detector.track(target, 'message', handlerA);
    detector.track(target, 'message', handlerB);
    detector.track(target, 'error', handlerA);

    expect(detector.countFor(target)).toBe(3);
    expect(detector.countFor(target, 'message')).toBe(2);
    expect(detector.countFor(target, 'error')).toBe(1);
    expect(detector.countFor(target, 'unknown')).toBe(0);
  });

  it('untrack removes only the matching handler', () => {
    const detector = new ListenerLeakDetector();
    const target = {};
    const handler = (): void => undefined;

    detector.track(target, 'x', handler);
    expect(detector.countFor(target, 'x')).toBe(1);

    detector.untrack(target, 'x', handler);
    expect(detector.countFor(target, 'x')).toBe(0);
  });

  it('reports stale listeners beyond maxAgeMs', () => {
    let t = 0;
    const detector = new ListenerLeakDetector({ now: () => t });
    const target = { name: 'emitter' };
    const handler = (): void => undefined;

    t = 1_000;
    detector.track(target, 'stale-event', handler);

    t = 1_200;
    expect(detector.reportStale(500)).toHaveLength(0);

    t = 3_000;
    const stale = detector.reportStale(500);
    expect(stale).toHaveLength(1);
    expect(stale[0]?.event).toBe('stale-event');
    expect(stale[0]?.ageMs).toBe(2_000);
    expect(stale[0]?.target).toBe(target);
  });

  it('returns zero count for untracked targets', () => {
    const detector = new ListenerLeakDetector();
    expect(detector.countFor({})).toBe(0);
    expect(detector.countFor({}, 'anything')).toBe(0);
  });
});
