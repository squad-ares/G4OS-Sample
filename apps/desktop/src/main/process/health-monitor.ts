import { randomUUID } from 'node:crypto';
import type { IDisposable } from '@g4os/kernel/disposable';
import { toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type { ProcessHandle } from '@g4os/platform';

const log = createLogger('health-monitor');

export interface HealthMonitorConfig {
  readonly intervalMs: number;
  readonly timeoutMs: number;
  readonly memoryLimitMb: number;
  readonly unhealthyThreshold: number;
}

interface HealthResponse {
  readonly type: 'health-response';
  readonly requestId: string;
  readonly rss: number;
  readonly heap: number;
  readonly status: 'ok' | 'degraded';
}

export class HealthMonitor {
  constructor(
    private readonly handle: ProcessHandle,
    private readonly config: HealthMonitorConfig,
  ) {}

  start(onUnhealthy: () => void): IDisposable {
    let consecutiveFailures = 0;

    const tick = async (): Promise<void> => {
      try {
        const result = await this.ping();
        const memoryExceeded = result.rss > this.config.memoryLimitMb * 1024 * 1024;
        if (result.status === 'degraded' || memoryExceeded) {
          consecutiveFailures++;
          log.warn(
            { processId: this.handle.id, consecutiveFailures, rss: result.rss },
            'unhealthy signal',
          );
        } else {
          consecutiveFailures = 0;
        }
      } catch (err) {
        consecutiveFailures++;
        log.error({ processId: this.handle.id, err, consecutiveFailures }, 'health check failed');
      }

      if (consecutiveFailures >= this.config.unhealthyThreshold) {
        onUnhealthy();
        consecutiveFailures = 0;
      }
    };

    const interval = setInterval(() => {
      void tick();
    }, this.config.intervalMs);

    return toDisposable(() => {
      clearInterval(interval);
    });
  }

  private ping(): Promise<HealthResponse> {
    return new Promise<HealthResponse>((resolve, reject) => {
      const requestId = randomUUID();
      const subscription = this.handle.onMessage((msg) => {
        if (!isHealthResponse(msg) || msg.requestId !== requestId) return;
        clearTimeout(timer);
        subscription.dispose();
        resolve(msg);
      });
      const timer = setTimeout(() => {
        subscription.dispose();
        reject(new Error('health check timeout'));
      }, this.config.timeoutMs);

      this.handle.postMessage({ type: 'health-check', requestId });
    });
  }
}

function isHealthResponse(msg: unknown): msg is HealthResponse {
  if (typeof msg !== 'object' || msg === null) return false;
  const record = msg as Record<string, unknown>;
  return (
    record['type'] === 'health-response' &&
    typeof record['requestId'] === 'string' &&
    typeof record['rss'] === 'number' &&
    typeof record['heap'] === 'number' &&
    (record['status'] === 'ok' || record['status'] === 'degraded')
  );
}
