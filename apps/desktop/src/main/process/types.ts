/**
 * Contrato compartilhado entre `ProcessSupervisor`, `ManagedProcess` e
 * `HealthMonitor`. Todas as interações com subprocessos passam por aqui.
 */

import type { IDisposable } from '@g4os/kernel/disposable';

export type ProcessKind = 'session' | 'mcp' | 'cpu-worker';

export type ProcessStatus = 'starting' | 'running' | 'unhealthy' | 'dead';

export interface ProcessStats {
  readonly cpu: number;
  readonly memoryRss: number;
}

export type RestartPolicy = 'never' | 'always' | 'on-crash';

export interface ProcessHandle extends IDisposable {
  readonly id: string;
  readonly kind: ProcessKind;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly pid: number | undefined;
  readonly status: ProcessStatus;
  readonly startedAt: number;
  readonly restarts: number;
  postMessage(message: unknown): boolean;
  onMessage(handler: (msg: unknown) => void): IDisposable;
  getStats(): Promise<ProcessStats>;
  stop(timeoutMs: number): Promise<void>;
  restart(): Promise<void>;
  waitForExit(): Promise<number | null>;
  forceKill(): void;
}

export interface SpawnConfig {
  readonly kind: ProcessKind;
  readonly modulePath: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly metadata?: Readonly<Record<string, unknown>>;

  readonly healthCheckIntervalMs?: number;
  readonly healthCheckTimeoutMs?: number;
  readonly unhealthyThreshold?: number;

  readonly restartPolicy?: RestartPolicy;
  readonly maxRestarts?: number;
  readonly restartBackoffMs?: number;

  readonly memoryLimitMb?: number;
}
