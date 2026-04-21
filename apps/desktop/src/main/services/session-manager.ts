import { fileURLToPath } from 'node:url';
import type { IDisposable } from '@g4os/kernel/disposable';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type { ProcessHandle } from '@g4os/platform';
import type { ProcessSupervisor } from '../process/supervisor.ts';

const log = createLogger('session-manager');

const NO_OP_DISPOSABLE: IDisposable = toDisposable(() => undefined);

const SESSION_MEMORY_LIMIT_MB = 500;
const SESSION_MAX_RESTARTS = 2;
const SESSION_HEALTH_INTERVAL_MS = 30_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

interface SessionEventMessage {
  readonly type: 'session-event';
  readonly event: unknown;
}

export class SessionManager extends DisposableBase {
  private readonly workers = new Map<string, ProcessHandle>();
  private readonly workerModulePath: string;

  constructor(private readonly supervisor: ProcessSupervisor) {
    super();
    this.workerModulePath = fileURLToPath(new URL('../workers/session-worker.js', import.meta.url));
  }

  async getOrSpawn(sessionId: string): Promise<ProcessHandle> {
    const existing = this.workers.get(sessionId);
    if (existing?.status === 'running') return existing;

    const handle = await this.supervisor.spawn({
      kind: 'session',
      modulePath: this.workerModulePath,
      args: [sessionId],
      metadata: { sessionId },
      restartPolicy: 'on-crash',
      maxRestarts: SESSION_MAX_RESTARTS,
      memoryLimitMb: SESSION_MEMORY_LIMIT_MB,
      healthCheckIntervalMs: SESSION_HEALTH_INTERVAL_MS,
    });

    this.workers.set(sessionId, handle);
    log.info({ sessionId, processId: handle.id }, 'session worker spawned');
    return handle;
  }

  async sendMessage(sessionId: string, payload: unknown): Promise<void> {
    const worker = await this.getOrSpawn(sessionId);
    worker.postMessage({ type: 'send-message', payload });
  }

  interrupt(sessionId: string): void {
    const worker = this.workers.get(sessionId);
    if (!worker) return;
    worker.postMessage({ type: 'interrupt' });
  }

  subscribe(sessionId: string, handler: (event: unknown) => void): IDisposable {
    const worker = this.workers.get(sessionId);
    if (!worker) return NO_OP_DISPOSABLE;
    return worker.onMessage((msg) => {
      if (isSessionEventMessage(msg)) handler(msg.event);
    });
  }

  async stopInactive(olderThanMs: number = DEFAULT_IDLE_TIMEOUT_MS): Promise<void> {
    const now = Date.now();
    const victims: Array<[string, ProcessHandle]> = [];
    for (const entry of this.workers.entries()) {
      if (now - entry[1].startedAt > olderThanMs) victims.push(entry);
    }

    for (const [sessionId, worker] of victims) {
      log.info({ sessionId }, 'stopping idle session worker');
      await worker.stop(2_000);
      this.workers.delete(sessionId);
    }
  }

  list(): readonly ProcessHandle[] {
    return Array.from(this.workers.values());
  }

  override dispose(): void {
    if (this._disposed) return;
    for (const worker of this.workers.values()) void worker.stop(1_000);
    this.workers.clear();
    super.dispose();
  }
}

function isSessionEventMessage(msg: unknown): msg is SessionEventMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const record = msg as Record<string, unknown>;
  return record['type'] === 'session-event' && 'event' in record;
}
