import { describe, expect, it } from 'vitest';
import { auditProcessListeners, MemoryMonitor } from '../memory/memory-monitor.ts';

function fakeUsage(partial: Partial<NodeJS.MemoryUsage>): () => NodeJS.MemoryUsage {
  return () => ({
    rss: 0,
    heapTotal: 0,
    heapUsed: 0,
    external: 0,
    arrayBuffers: 0,
    ...partial,
  });
}

describe('MemoryMonitor', () => {
  it('collects samples with fake clock and memoryUsage', () => {
    const mon = new MemoryMonitor({
      now: () => 1_000,
      memoryUsage: fakeUsage({ rss: 1024, heapUsed: 512 }),
    });
    const sample = mon.sampleOnce();
    expect(sample.rssBytes).toBe(1024);
    expect(sample.heapUsedBytes).toBe(512);
    expect(sample.timestamp).toBe(1_000);
    expect(mon.getLatest()).toEqual(sample);
    mon.dispose();
  });

  it('evicts history beyond historySize', () => {
    let t = 0;
    let heap = 100;
    const mon = new MemoryMonitor({
      historySize: 3,
      now: () => ++t,
      memoryUsage: () => ({
        rss: 0,
        heapTotal: 0,
        heapUsed: heap++,
        external: 0,
        arrayBuffers: 0,
      }),
    });
    for (let i = 0; i < 5; i++) mon.sampleOnce();
    const history = mon.getHistory();
    expect(history).toHaveLength(3);
    expect(history[0]?.heapUsedBytes).toBe(102);
    expect(history[2]?.heapUsedBytes).toBe(104);
    mon.dispose();
  });

  it('fires onThresholdExceeded for rss overage', () => {
    const events: string[] = [];
    const mon = new MemoryMonitor({
      thresholds: { rssBytes: 1_000 },
      memoryUsage: fakeUsage({ rss: 2_000 }),
      onThresholdExceeded: (reason) => events.push(reason),
    });
    mon.sampleOnce();
    expect(events.some((e) => e.startsWith('rss'))).toBe(true);
    mon.dispose();
  });

  it('fires onThresholdExceeded for heap growth beyond ratio', () => {
    const events: string[] = [];
    let heap = 100;
    const mon = new MemoryMonitor({
      thresholds: { heapGrowthRatio: 1.5 },
      memoryUsage: () => ({
        rss: 0,
        heapTotal: 0,
        heapUsed: heap,
        external: 0,
        arrayBuffers: 0,
      }),
      onThresholdExceeded: (reason) => events.push(reason),
    });
    // CR8-19: baseline agora skipa os primeiros 3 samples (boot/JIT spike).
    // Precisamos de 4 samples na fase "warm" antes do growth disparar:
    // 3 samples ignorados → 4º vira baseline → 5º excede ratio.
    mon.sampleOnce();
    mon.sampleOnce();
    mon.sampleOnce();
    mon.sampleOnce(); // baseline = 100
    heap = 200; // 200 > 100 * 1.5 → growth threshold
    mon.sampleOnce();
    expect(events.some((e) => e.startsWith('heap'))).toBe(true);
    mon.dispose();
  });

  it('start() + dispose() cleans the interval timer', () => {
    const mon = new MemoryMonitor({
      intervalMs: 50,
      memoryUsage: fakeUsage({}),
    });
    mon.start();
    mon.dispose();
  });
});

describe('auditProcessListeners', () => {
  it('returns only events whose count exceeds the threshold', () => {
    const handler = (): void => undefined;
    for (let i = 0; i < 6; i++) process.on('uncaughtException', handler);
    try {
      const result = auditProcessListeners(['uncaughtException'], 5);
      expect(result).toHaveLength(1);
      expect(result[0]?.event).toBe('uncaughtException');
      expect(result[0]?.count).toBeGreaterThan(5);
    } finally {
      for (let i = 0; i < 6; i++) process.off('uncaughtException', handler);
    }
  });
});
