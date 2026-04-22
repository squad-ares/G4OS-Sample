/**
 * SessionsCleanupScheduler — timer daemon que purga sessões `deleted`
 * cujo `deletedAt` passou da janela de retenção (30 dias default).
 *
 * Runs once on boot (best-effort) e depois a cada `intervalMs`. Cada
 * sessão elegível é removida fisicamente do SQLite (`hardDelete`); o
 * cascade FK limpa `messages_index`, `session_labels`, etc. Os arquivos
 * JSONL em disco não são apagados aqui — isso fica para um scheduler de
 * filesystem separado que também recolhe orphan attachments.
 */

import type { AppDb } from '@g4os/data';
import { SessionsRepository } from '@g4os/data/sessions';
import { DisposableBase, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';

const log = createLogger('sessions-cleanup');

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionsCleanupSchedulerOptions {
  readonly drizzle: AppDb;
  /** Dias para manter sessões deletadas antes de purgar. Default: 30. */
  readonly retentionDays?: number;
  /** Intervalo entre execuções em ms. Default: 24h. */
  readonly intervalMs?: number;
  /** Injetável para testes. */
  readonly now?: () => number;
}

export class SessionsCleanupScheduler extends DisposableBase {
  readonly #repo: SessionsRepository;
  readonly #retentionMs: number;
  readonly #intervalMs: number;
  readonly #now: () => number;

  constructor(options: SessionsCleanupSchedulerOptions) {
    super();
    this.#repo = new SessionsRepository(options.drizzle);
    this.#retentionMs = (options.retentionDays ?? 30) * DAY_MS;
    this.#intervalMs = options.intervalMs ?? DAY_MS;
    this.#now = options.now ?? Date.now;
  }

  start(): void {
    void this.runOnce();
    const handle = setInterval(() => {
      void this.runOnce();
    }, this.#intervalMs);
    handle.unref?.();
    this._register(toDisposable(() => clearInterval(handle)));
  }

  async runOnce(): Promise<{ readonly purged: number }> {
    const cutoff = this.#now() - this.#retentionMs;
    try {
      const ids = await this.#repo.findPurgeable(cutoff);
      for (const id of ids) {
        try {
          await this.#repo.hardDelete(id);
        } catch (error) {
          log.warn({ err: error, id }, 'hard delete failed; continuing');
        }
      }
      if (ids.length > 0) {
        log.info({ purged: ids.length, cutoff }, 'sessions cleanup complete');
      }
      return { purged: ids.length };
    } catch (error) {
      log.error({ err: error, cutoff }, 'sessions cleanup failed');
      return { purged: 0 };
    }
  }
}
