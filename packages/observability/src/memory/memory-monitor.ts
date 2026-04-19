import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { createLogger, type Logger } from '@g4os/kernel/logger';

export interface MemorySample {
  readonly timestamp: number;
  readonly rssBytes: number;
  readonly heapUsedBytes: number;
  readonly heapTotalBytes: number;
  readonly externalBytes: number;
  readonly arrayBuffersBytes: number;
}

export interface MemoryThresholds {
  readonly rssBytes?: number;
  readonly heapGrowthRatio?: number;
}

export interface MemoryMonitorOptions {
  readonly intervalMs?: number;
  readonly thresholds?: MemoryThresholds;
  readonly historySize?: number;
  readonly logger?: Logger;
  readonly now?: () => number;
  readonly memoryUsage?: () => NodeJS.MemoryUsage;
  readonly onSample?: (sample: MemorySample) => void;
  readonly onThresholdExceeded?: (reason: string, sample: MemorySample) => void;
}

const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_HISTORY = 20;
const DEFAULT_HEAP_GROWTH_RATIO = 1.5;

export class MemoryMonitor extends DisposableBase {
  private readonly intervalMs: number;
  private readonly historySize: number;
  private readonly thresholds: MemoryThresholds;
  private readonly log: Logger;
  private readonly now: () => number;
  private readonly memoryUsage: () => NodeJS.MemoryUsage;
  private readonly onSample?: (sample: MemorySample) => void;
  private readonly onThresholdExceeded?: (reason: string, sample: MemorySample) => void;
  private readonly history: MemorySample[] = [];
  private baselineHeap: number | undefined;
  private timer: NodeJS.Timeout | undefined;

  constructor(options: MemoryMonitorOptions = {}) {
    super();
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.historySize = options.historySize ?? DEFAULT_HISTORY;
    this.thresholds = options.thresholds ?? {};
    this.log = options.logger ?? createLogger('memory-monitor');
    this.now = options.now ?? (() => Date.now());
    this.memoryUsage = options.memoryUsage ?? (() => process.memoryUsage());
    if (options.onSample) this.onSample = options.onSample;
    if (options.onThresholdExceeded) this.onThresholdExceeded = options.onThresholdExceeded;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.sampleOnce(), this.intervalMs).unref();
    this._register(
      toDisposable(() => {
        if (this.timer) clearInterval(this.timer);
        this.timer = undefined;
      }),
    );
  }

  sampleOnce(): MemorySample {
    const usage = this.memoryUsage();
    const sample: MemorySample = {
      timestamp: this.now(),
      rssBytes: usage.rss,
      heapUsedBytes: usage.heapUsed,
      heapTotalBytes: usage.heapTotal,
      externalBytes: usage.external,
      arrayBuffersBytes: usage.arrayBuffers,
    };
    this.recordSample(sample);
    this.checkThresholds(sample);
    this.onSample?.(sample);
    return sample;
  }

  getHistory(): readonly MemorySample[] {
    return [...this.history];
  }

  getLatest(): MemorySample | undefined {
    return this.history.at(-1);
  }

  private recordSample(sample: MemorySample): void {
    this.history.push(sample);
    if (this.history.length > this.historySize) {
      this.history.shift();
    }
    if (this.baselineHeap === undefined) {
      this.baselineHeap = sample.heapUsedBytes;
    }
  }

  private checkThresholds(sample: MemorySample): void {
    if (this.thresholds.rssBytes && sample.rssBytes > this.thresholds.rssBytes) {
      const reason = `rss ${sample.rssBytes} > threshold ${this.thresholds.rssBytes}`;
      this.log.warn({ sample, reason }, 'memory threshold exceeded');
      this.onThresholdExceeded?.(reason, sample);
    }

    const ratio = this.thresholds.heapGrowthRatio ?? DEFAULT_HEAP_GROWTH_RATIO;
    if (this.baselineHeap !== undefined && sample.heapUsedBytes > this.baselineHeap * ratio) {
      const reason = `heap ${sample.heapUsedBytes} > baseline ${this.baselineHeap} × ${ratio}`;
      this.log.warn({ sample, reason }, 'heap growth detected');
      this.onThresholdExceeded?.(reason, sample);
    }
  }
}

export interface ListenerAuditResult {
  readonly target: string;
  readonly event: string;
  readonly count: number;
}

export function auditProcessListeners(
  events: readonly string[] = ['uncaughtException', 'unhandledRejection', 'SIGTERM', 'SIGINT'],
  threshold = 5,
): ListenerAuditResult[] {
  const result: ListenerAuditResult[] = [];
  for (const event of events) {
    const count = process.listenerCount(event);
    if (count > threshold) {
      result.push({ target: 'process', event, count });
    }
  }
  return result;
}
