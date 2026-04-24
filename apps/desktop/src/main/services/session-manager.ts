import { fileURLToPath } from 'node:url';
import type { IDisposable } from '@g4os/kernel/disposable';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type { ProcessHandle } from '@g4os/platform';
import type { SessionEventBus } from '@g4os/session-runtime';
import type { ProcessSupervisor } from '../process/supervisor.ts';
import type { MainToWorker, MainToWorkerDispatch, WorkerToMain } from '../workers/protocol.ts';
import { isWorkerToMain } from '../workers/protocol.ts';

const log = createLogger('session-manager');

const NO_OP_DISPOSABLE: IDisposable = toDisposable(() => undefined);

const SESSION_MEMORY_LIMIT_MB = 500;
const SESSION_MAX_RESTARTS = 2;
const SESSION_HEALTH_INTERVAL_MS = 30_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

interface WorkerEntry {
  readonly handle: ProcessHandle;
  readonly busBridge: IDisposable | null;
}

export interface SessionManagerOptions {
  readonly eventBus?: SessionEventBus;
}

export class SessionManager extends DisposableBase {
  private readonly workers = new Map<string, WorkerEntry>();
  private readonly workerModulePath: string;
  private readonly eventBus: SessionEventBus | null;

  constructor(
    private readonly supervisor: ProcessSupervisor,
    options: SessionManagerOptions = {},
  ) {
    super();
    // `session-manager.ts` é inlined em `out/main/index.cjs`; o worker sai como
    // bundle próprio em `out/main/workers/session-worker.cjs`. Em dev e em
    // produção `import.meta.url` aponta para `index.cjs`, portanto o path
    // relativo é `./workers/...`, não `../workers/...`.
    this.workerModulePath = fileURLToPath(new URL('./workers/session-worker.cjs', import.meta.url));
    this.eventBus = options.eventBus ?? null;
  }

  async getOrSpawn(sessionId: string): Promise<ProcessHandle> {
    const existing = this.workers.get(sessionId);
    if (existing && existing.handle.status === 'running') return existing.handle;

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

    const busBridge = this.eventBus ? this.wireEventBus(sessionId, handle) : null;
    this.workers.set(sessionId, { handle, busBridge });
    log.info({ sessionId, processId: handle.id }, 'session worker spawned');
    return handle;
  }

  async sendMessage(sessionId: string, payload: unknown, turnId?: string): Promise<void> {
    const worker = await this.getOrSpawn(sessionId);
    const msg: MainToWorker = {
      type: 'send-message',
      payload,
      ...(turnId ? { turnId } : {}),
    };
    worker.postMessage(msg);
  }

  /**
   * Despacha um turn para o worker. Main deve ter persistido a mensagem do
   * user **antes** de chamar este método; o worker apenas roda o agent e
   * emite `turn-stream` + `turn-complete` para o main re-emitir no bus.
   */
  async dispatchTurn(cmd: Omit<MainToWorkerDispatch, 'type'>): Promise<void> {
    const worker = await this.getOrSpawn(cmd.sessionId);
    const msg: MainToWorkerDispatch = { type: 'dispatch', ...cmd };
    worker.postMessage(msg);
  }

  interrupt(sessionId: string, turnId?: string): void {
    const entry = this.workers.get(sessionId);
    if (!entry) return;
    const msg: MainToWorker = {
      type: 'interrupt',
      ...(turnId ? { turnId } : {}),
    };
    entry.handle.postMessage(msg);
  }

  /**
   * Subscriber direto por sessionId (legado). Novos consumidores devem usar
   * o `SessionEventBus` que este manager alimenta automaticamente quando
   * construído com `options.eventBus`.
   */
  subscribe(sessionId: string, handler: (event: unknown) => void): IDisposable {
    const entry = this.workers.get(sessionId);
    if (!entry) return NO_OP_DISPOSABLE;
    return entry.handle.onMessage((msg) => {
      if (!isWorkerToMain(msg)) return;
      if (msg.type === 'session-event') handler(msg.event);
    });
  }

  async stopInactive(olderThanMs: number = DEFAULT_IDLE_TIMEOUT_MS): Promise<void> {
    const now = Date.now();
    const victims: Array<[string, WorkerEntry]> = [];
    for (const entry of this.workers.entries()) {
      if (now - entry[1].handle.startedAt > olderThanMs) victims.push(entry);
    }

    for (const [sessionId, entry] of victims) {
      log.info({ sessionId }, 'stopping idle session worker');
      entry.busBridge?.dispose();
      await entry.handle.stop(2_000);
      this.workers.delete(sessionId);
    }
  }

  list(): readonly ProcessHandle[] {
    return Array.from(this.workers.values(), (entry) => entry.handle);
  }

  override dispose(): void {
    if (this._disposed) return;
    for (const entry of this.workers.values()) {
      entry.busBridge?.dispose();
      void entry.handle.stop(1_000);
    }
    this.workers.clear();
    super.dispose();
  }

  /**
   * Liga eventos do worker ao `SessionEventBus`:
   *   - `session-event` (persistido) e `turn-stream` (transiente) são
   *     re-emitidos como `SessionBusEvent`;
   *   - `error` é logado e encaminhado como `turn.error` genérico com
   *     `turnId: 'worker'` para sinalizar falha estrutural.
   */
  private wireEventBus(sessionId: string, handle: ProcessHandle): IDisposable {
    const bus = this.eventBus;
    if (!bus) return NO_OP_DISPOSABLE;
    return handle.onMessage((raw) => {
      if (!isWorkerToMain(raw)) return;
      this.handleWorkerEvent(sessionId, raw, bus);
    });
  }

  private handleWorkerEvent(sessionId: string, msg: WorkerToMain, bus: SessionEventBus): void {
    switch (msg.type) {
      case 'session-event':
        bus.emit(sessionId, msg.event as Parameters<SessionEventBus['emit']>[1]);
        return;
      case 'turn-stream':
        bus.emit(sessionId, msg.event as Parameters<SessionEventBus['emit']>[1]);
        return;
      case 'turn-complete':
        bus.emit(sessionId, {
          type: 'turn.complete',
          sessionId,
          turnId: msg.turnId,
          reason: msg.reason,
          text: msg.text,
          thinking: msg.thinking,
          usage: msg.usage,
          modelId: msg.modelId,
        });
        return;
      case 'error':
        log.error({ sessionId, code: msg.code, message: msg.message }, 'worker reported error');
        bus.emit(sessionId, {
          type: 'turn.error',
          sessionId,
          turnId: msg.turnId ?? 'worker',
          code: msg.code,
          message: msg.message,
        });
        return;
      case 'ready':
        log.info({ sessionId, pid: msg.pid }, 'worker ready');
        return;
      case 'health-response':
        log.debug({ sessionId, rss: msg.rss, heap: msg.heap, status: msg.status }, 'worker health');
        return;
    }
  }
}
