/**
 * Pool Piscina para tarefas CPU-bound (parsing de JSONL, render de
 * markdown em lote, compressão). Carregado via import dinâmico para
 * manter `@g4os/desktop` tipável quando `piscina` ainda não está
 * instalado no workspace (fase atual do scaffolding).
 */

import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createLogger } from '@g4os/kernel/logger';

const log = createLogger('cpu-pool');

const DEFAULT_MIN_THREADS = 2;
const DEFAULT_MAX_THREADS = 8;
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_QUEUE = 100;

interface PiscinaLike {
  run(data: unknown, options?: { name?: string }): Promise<unknown>;
  destroy(): Promise<void>;
}

interface Options {
  filename: string;
  minThreads?: number;
  maxThreads?: number;
  idleTimeout?: number;
  maxQueue?: number;
}

interface PiscinaConstructor {
  new (options: Options): PiscinaLike;
}

interface PiscinaModule {
  default: PiscinaConstructor;
}

export interface CpuPoolOptions {
  readonly minThreads?: number;
  readonly maxThreads?: number;
  readonly idleTimeoutMs?: number;
  readonly maxQueue?: number;
}

export class CpuPool {
  private pool: PiscinaLike | null = null;
  private loadPromise: Promise<PiscinaLike> | null = null;

  constructor(private readonly options: CpuPoolOptions = {}) {}

  async run<T>(taskName: string, ...args: unknown[]): Promise<T> {
    const pool = await this.ensurePool();
    const start = Date.now();
    try {
      const result = await pool.run({ args }, { name: taskName });
      log.debug({ taskName, durationMs: Date.now() - start }, 'cpu task ok');
      return result as T;
    } catch (err) {
      log.error({ taskName, err }, 'cpu task failed');
      throw err;
    }
  }

  async destroy(): Promise<void> {
    const pool = this.pool;
    this.pool = null;
    this.loadPromise = null;
    if (pool) await pool.destroy();
  }

  private ensurePool(): Promise<PiscinaLike> {
    if (this.pool) return Promise.resolve(this.pool);
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loadPool().then((pool) => {
      this.pool = pool;
      return pool;
    });
    return this.loadPromise;
  }

  private async loadPool(): Promise<PiscinaLike> {
    const specifier = 'piscina';
    const mod = (await import(/* @vite-ignore */ specifier)) as PiscinaModule;
    const filename = fileURLToPath(new URL('../workers/cpu-pool/tasks.js', import.meta.url));

    const maxThreads =
      this.options.maxThreads ??
      Math.max(DEFAULT_MIN_THREADS, Math.min(DEFAULT_MAX_THREADS, cpus().length - 1));

    return new mod.default({
      filename,
      minThreads: this.options.minThreads ?? DEFAULT_MIN_THREADS,
      maxThreads,
      idleTimeout: this.options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      maxQueue: this.options.maxQueue ?? DEFAULT_MAX_QUEUE,
    });
  }
}
