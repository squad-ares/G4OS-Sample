/**
 * Registro central de processos filhos do main process.
 *
 * - Spawna `utilityProcess` com política de restart, health checks e
 *   limites de memória.
 * - Mantém inventário consultável por `kind` para debugging e shutdown.
 * - Shutdown ordeiro: sinaliza graceful, aguarda deadline, força kill.
 */

import { randomUUID } from 'node:crypto';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type { ElectronRuntime } from '../electron-runtime.ts';
import { HealthMonitor } from './health-monitor.ts';
import { ManagedProcess } from './managed-process.ts';
import type { ProcessHandle, ProcessKind, SpawnConfig } from './types.ts';

const log = createLogger('process-supervisor');

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;
const DEFAULT_HEALTH_INTERVAL_MS = 30_000;
const DEFAULT_HEALTH_TIMEOUT_MS = 5_000;
const DEFAULT_MEMORY_LIMIT_MB = 500;
const DEFAULT_UNHEALTHY_THRESHOLD = 3;

export class ProcessSupervisor extends DisposableBase {
  private readonly processes = new Map<string, ManagedProcess>();

  constructor(private readonly runtime: ElectronRuntime) {
    super();
  }

  async spawn(config: SpawnConfig): Promise<ProcessHandle> {
    const id = randomUUID();
    const managed = new ManagedProcess(id, config, this.runtime);
    await managed.start();
    this.processes.set(id, managed);

    this._register(toDisposable(() => managed.dispose()));

    const monitor = new HealthMonitor(managed, {
      intervalMs: config.healthCheckIntervalMs ?? DEFAULT_HEALTH_INTERVAL_MS,
      timeoutMs: config.healthCheckTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS,
      memoryLimitMb: config.memoryLimitMb ?? DEFAULT_MEMORY_LIMIT_MB,
      unhealthyThreshold: config.unhealthyThreshold ?? DEFAULT_UNHEALTHY_THRESHOLD,
    });
    this._register(
      monitor.start(() => {
        log.warn({ processId: id }, 'process unhealthy, restarting');
        void managed.restart();
      }),
    );

    log.info(
      { processId: id, kind: config.kind, pid: managed.pid, metadata: config.metadata },
      'process started',
    );
    return managed;
  }

  get(id: string): ProcessHandle | undefined {
    return this.processes.get(id);
  }

  listByKind(kind: ProcessKind): ProcessHandle[] {
    return Array.from(this.processes.values()).filter((p) => p.kind === kind);
  }

  list(): ProcessHandle[] {
    return Array.from(this.processes.values());
  }

  async shutdownAll(timeoutMs: number = DEFAULT_SHUTDOWN_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    log.info({ count: this.processes.size, timeoutMs }, 'shutting down all processes');

    for (const p of this.processes.values()) {
      p.postMessage({ type: 'shutdown', reason: 'app-quit' });
    }

    const results = await Promise.allSettled(
      Array.from(this.processes.values()).map((p) => {
        const remaining = Math.max(0, deadline - Date.now());
        return Promise.race([
          p.waitForExit(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('shutdown timeout')), remaining),
          ),
        ]);
      }),
    );

    const stuck = results.filter((r) => r.status === 'rejected');
    if (stuck.length > 0) {
      log.warn({ count: stuck.length }, 'force killing stuck processes');
      for (const p of this.processes.values()) p.forceKill();
    }

    this.processes.clear();
  }
}
