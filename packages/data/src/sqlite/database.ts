/**
 * Wrapper tipado e disposable ao redor de `node:sqlite` (Node 24 LTS).
 *
 * Por que `node:sqlite` em vez de `better-sqlite3`:
 *  - Zero binding nativo externo → sem `asarUnpack`, sem `npmRebuild`,
 *    sem ABI mismatch entre Node e Electron, sem quarentena de antivírus.
 *  - Elimina uma das classes de incidentes do cliente (runtime perdido
 *    no Windows) como vetor possível.
 *  - API síncrona, estável desde Node 24.0 (mai/2025).
 *  - Drizzle ORM tem adapter first-class (`drizzle-orm/node-sqlite`).
 *
 * Contrato público mantido: `prepare`, `exec`, `pragma`, `transaction`,
 * `close`, `dispose`. Pragmas padrão: WAL, FK ON, synchronous=NORMAL,
 * mmap 256MB. Arquivo default: `getAppPaths().data/app.db`.
 *
 * Ver ADR-0040a.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { DisposableBase } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import { getAppPaths } from '@g4os/platform';
import { SqliteClosedError, SqliteOpenError } from './errors.ts';

const log = createLogger('sqlite');

const DEFAULT_MMAP_BYTES = 256 * 1024 * 1024;
const DEFAULT_JOURNAL_MODE: JournalMode = 'wal';
const DEFAULT_SYNC_MODE: SynchronousMode = 'normal';

export type JournalMode = 'delete' | 'truncate' | 'persist' | 'memory' | 'wal' | 'off';
export type SynchronousMode = 'off' | 'normal' | 'full' | 'extra';

export interface DbOptions {
  /** Caminho absoluto do arquivo. Default: `<paths.data>/app.db`. */
  readonly filename?: string;
  /** Se `true`, abre o DB em modo leitura. */
  readonly readonly?: boolean;
  /** Tamanho do mmap em bytes (default 256MB). `0` desativa. */
  readonly mmapBytes?: number;
  /** `journal_mode`. Default: `wal`. */
  readonly journalMode?: JournalMode;
  /** `synchronous`. Default: `normal`. */
  readonly synchronous?: SynchronousMode;
  /** Se `true`, usa `:memory:` (útil em testes). */
  readonly inMemory?: boolean;
}

export class Db extends DisposableBase {
  private database: DatabaseSync | null = null;
  private _filename = '';

  /** Caminho efetivo do DB aberto (ou `:memory:`). */
  get filename(): string {
    return this._filename;
  }

  /** `true` quando o DB está aberto. */
  get isOpen(): boolean {
    return this.database?.isOpen ?? false;
  }

  /** Acesso ao handle nativo. Lança se não aberto. */
  get raw(): DatabaseSync {
    if (!this.database) throw new SqliteClosedError();
    return this.database;
  }

  /** Abre o DB e aplica pragmas. */
  async open(options: DbOptions = {}): Promise<void> {
    if (this.database) return;

    const filename = await resolveFilename(options);
    this._filename = filename;

    try {
      this.database = new DatabaseSync(filename, {
        open: true,
        readOnly: options.readonly ?? false,
      });
    } catch (err) {
      throw new SqliteOpenError(filename, err);
    }

    this.applyPragmas(options);

    log.info(
      { filename, readonly: options.readonly === true, inMemory: options.inMemory === true },
      'database opened',
    );
  }

  /** Prepara statement reutilizável. Apenas para DB aberto. */
  prepare(sql: string): StatementSync {
    return this.raw.prepare(sql);
  }

  /** Executa SQL multi-statement (DDL, bulk). */
  exec(sql: string): void {
    this.raw.exec(sql);
  }

  /**
   * Lê ou define um pragma. Em leitura retorna o valor; em escrita
   * retorna `undefined`. `node:sqlite` não tem `pragma()` dedicado —
   * emulamos com `prepare().get()` para leituras e `exec()` para escritas.
   */
  pragma(source: string): unknown {
    const trimmed = source.trim();
    const isAssignment = trimmed.includes('=');
    if (isAssignment) {
      this.raw.exec(`PRAGMA ${trimmed}`);
      return undefined;
    }
    const stmt = this.raw.prepare(`PRAGMA ${trimmed}`);
    const row = stmt.get() as Record<string, unknown> | undefined;
    if (!row) return undefined;
    const keys = Object.keys(row);
    return keys.length === 1 ? row[keys[0] as string] : row;
  }

  /**
   * Executa `fn` dentro de uma transação. Commit em sucesso, rollback
   * em throw. Substitui o helper `db.transaction()` do better-sqlite3
   * com BEGIN/COMMIT/ROLLBACK explícitos.
   */
  transaction<T>(fn: () => T): T {
    const db = this.raw;
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch (rollbackErr) {
        log.error({ err: rollbackErr }, 'rollback failed after transaction error');
      }
      throw err;
    }
  }

  /** Fecha o DB. Idempotente. */
  close(): void {
    if (!this.database) return;
    try {
      this.database.close();
    } catch (err) {
      log.warn({ err, filename: this._filename }, 'error while closing database');
    } finally {
      this.database = null;
      log.info({ filename: this._filename }, 'database closed');
    }
  }

  override dispose(): void {
    this.close();
    super.dispose();
  }

  private applyPragmas(options: DbOptions): void {
    const db = this.raw;
    // CR-18 F-D2: `:memory:` não tem disk, então `journal_mode = wal` é
    // ignorado pelo SQLite (sempre rola `memory` mode). Skip evita o
    // setting morto + reduz noise em CI (94 testes inicializam in-memory).
    if (this._filename !== ':memory:') {
      db.exec(`PRAGMA journal_mode = ${options.journalMode ?? DEFAULT_JOURNAL_MODE}`);
    }
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(`PRAGMA synchronous = ${options.synchronous ?? DEFAULT_SYNC_MODE}`);
    const mmap = options.mmapBytes ?? DEFAULT_MMAP_BYTES;
    if (mmap > 0 && this._filename !== ':memory:') db.exec(`PRAGMA mmap_size = ${mmap}`);
  }
}

async function resolveFilename(options: DbOptions): Promise<string> {
  if (options.inMemory) return ':memory:';
  if (options.filename) {
    await mkdir(dirname(options.filename), { recursive: true });
    return options.filename;
  }
  const paths = getAppPaths();
  await mkdir(paths.data, { recursive: true });
  return join(paths.data, 'app.db');
}
