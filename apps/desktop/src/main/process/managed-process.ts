/**
 * Representa um subprocesso gerenciado. Encapsula o ciclo de vida do
 * `utilityProcess` — spawn, stdio, shutdown, restart com backoff — e
 * expõe a interface `ProcessHandle` consumida pelo `ProcessSupervisor`.
 *
 * Memory stats são obtidas via `pidusage` quando disponível; fora disso
 * retornamos zeros (CI/scaffolding sem a dependência instalada).
 */

import type { IDisposable } from '@g4os/kernel/disposable';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import type { ElectronRuntime, UtilityProcessInstance } from '../electron-runtime.ts';
import type {
  ProcessHandle,
  ProcessKind,
  ProcessStats,
  ProcessStatus,
  SpawnConfig,
} from './types.ts';

const log = createLogger('managed-process');

const DEFAULT_RESTART_BACKOFF_MS = 1_000;
const DEFAULT_MAX_RESTARTS = 3;

export class ManagedProcess extends DisposableBase implements ProcessHandle {
  private proc: UtilityProcessInstance | null = null;
  private statusValue: ProcessStatus = 'starting';
  private restartCount = 0;
  public readonly startedAt = Date.now();
  private readonly messageHandlers = new Set<(msg: unknown) => void>();
  private readonly exitWaiters = new Set<(code: number | null) => void>();
  private lastExitCode: number | null = null;

  constructor(
    public readonly id: string,
    private readonly config: SpawnConfig,
    private readonly runtime: ElectronRuntime,
  ) {
    super();
  }

  get kind(): ProcessKind {
    return this.config.kind;
  }

  get metadata(): Readonly<Record<string, unknown>> {
    return this.config.metadata ?? {};
  }

  get pid(): number | undefined {
    return this.proc?.pid;
  }

  get status(): ProcessStatus {
    return this.statusValue;
  }

  get restarts(): number {
    return this.restartCount;
  }

  async start(): Promise<void> {
    await Promise.resolve();
    const forkOptions: UtilityProcessForkInvocation = { stdio: 'pipe' };
    if (this.config.env) forkOptions.env = { ...this.config.env };

    const proc = this.runtime.utilityProcess.fork(
      this.config.modulePath,
      this.config.args ? [...this.config.args] : undefined,
      forkOptions,
    );
    this.proc = proc;

    proc.on('message', (msg) => {
      for (const handler of this.messageHandlers) handler(msg);
    });

    proc.on('exit', (code) => {
      log.warn({ processId: this.id, code }, 'process exited');
      this.statusValue = 'dead';
      this.lastExitCode = code;
      for (const waiter of this.exitWaiters) waiter(code);
      this.exitWaiters.clear();
      void this.onExit(code);
    });

    proc.stdout?.on('data', (chunk) => {
      log.debug({ processId: this.id, output: String(chunk) }, 'stdout');
    });
    proc.stderr?.on('data', (chunk) => {
      log.warn({ processId: this.id, output: String(chunk) }, 'stderr');
    });

    this.statusValue = 'running';
  }

  private async onExit(code: number | null): Promise<void> {
    if (this._disposed) return;
    const policy = this.config.restartPolicy ?? 'on-crash';
    const maxRestarts = this.config.maxRestarts ?? DEFAULT_MAX_RESTARTS;
    const crashed = code !== 0 && code !== null;

    if (policy === 'never') return;
    if (policy === 'on-crash' && !crashed) return;
    if (this.restartCount >= maxRestarts) {
      log.error(
        { processId: this.id, restarts: this.restartCount },
        'max restarts reached; giving up',
      );
      return;
    }

    const base = this.config.restartBackoffMs ?? DEFAULT_RESTART_BACKOFF_MS;
    const backoff = base * 2 ** this.restartCount;
    log.info(
      { processId: this.id, restartsCount: this.restartCount + 1, backoffMs: backoff },
      'restarting process',
    );
    await new Promise<void>((resolve) => setTimeout(resolve, backoff));
    this.restartCount++;
    await this.start();
  }

  async restart(): Promise<void> {
    await this.stop(2_000);
    await this.start();
  }

  async stop(timeoutMs: number): Promise<void> {
    await Promise.resolve();
    const proc = this.proc;
    if (!proc || this.statusValue === 'dead') return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        proc.kill();
        resolve();
      }, timeoutMs);
      proc.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      proc.postMessage({ type: 'shutdown', reason: 'supervisor-stop' });
    });
  }

  postMessage(message: unknown): boolean {
    if (!this.proc || this.statusValue !== 'running') return false;
    this.proc.postMessage(message);
    return true;
  }

  onMessage(handler: (msg: unknown) => void): IDisposable {
    this.messageHandlers.add(handler);
    return toDisposable(() => {
      this.messageHandlers.delete(handler);
    });
  }

  async getStats(): Promise<ProcessStats> {
    const pid = this.proc?.pid;
    if (!pid) return { cpu: 0, memoryRss: 0 };
    return (await loadPidStats(pid)) ?? { cpu: 0, memoryRss: 0 };
  }

  waitForExit(): Promise<number | null> {
    if (this.statusValue === 'dead') return Promise.resolve(this.lastExitCode);
    return new Promise((resolve) => {
      this.exitWaiters.add(resolve);
    });
  }

  forceKill(): void {
    this.proc?.kill();
  }

  override dispose(): void {
    if (this._disposed) return;
    this.messageHandlers.clear();
    void this.stop(1_000);
    super.dispose();
  }
}

interface UtilityProcessForkInvocation {
  stdio: 'pipe';
  env?: Record<string, string>;
}

interface PidStatsModule {
  default: (pid: number) => Promise<{ cpu: number; memory: number }>;
}

async function loadPidStats(pid: number): Promise<ProcessStats | null> {
  try {
    const specifier = 'pidusage';
    const mod = (await import(/* @vite-ignore */ specifier)) as PidStatsModule;
    const result = await mod.default(pid);
    return { cpu: result.cpu, memoryRss: result.memory };
  } catch {
    return null;
  }
}
