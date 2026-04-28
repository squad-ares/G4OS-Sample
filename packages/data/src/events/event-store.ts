/**
 * Event store append-only em JSONL (1 arquivo por sessão).
 *
 * Fonte de verdade da sessão é o log de eventos; projections em SQLite
 * (sessions, messages_index, FTS5) são reconstruídos via replay. Ver
 * ADR-0010 (event sourcing) e ADR-0043 (JSONL format).
 *
 * Contrato:
 *   - `append(sessionId, event)` valida o evento (Zod) e escreve 1 linha
 *     atomicamente via `appendFile` com `O_APPEND` (kernel garante
 *     atomicidade por write ≤ PIPE_BUF em fs nativos).
 *   - `read(sessionId)` retorna AsyncGenerator de eventos validados.
 *     Eventos corrompidos (JSON/Zod inválido) lançam — replay quebra
 *     na linha ruim em vez de swallow silencioso.
 *   - `readAfter(sessionId, seq)` retorna apenas eventos com
 *     `sequenceNumber > seq`. Usado em recovery a partir de checkpoint.
 *
 * Não mantemos `WriteStream` aberto: em processos utility com
 * backpressure (muitos workers), evitar file descriptors órfãos. Cada
 * append paga o custo de `open+write+close` que é aceitável (< 1ms em
 * SSD moderno; testado em CI).
 */

import { createReadStream } from 'node:fs';
import { appendFile, mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createLogger } from '@g4os/kernel/logger';
import { type SessionEvent, SessionEventSchema } from '@g4os/kernel/schemas';
import { getAppPaths } from '@g4os/platform';

const log = createLogger('event-store');

/** Idade em ms acima da qual `.tmp` órfãos são considerados resíduo de crash. */
const ORPHAN_TMP_MAX_AGE_MS = 60 * 60 * 1000; // 1h

const EVENTS_FILE = 'events.jsonl';

export interface SessionEventStoreOptions {
  /** Override de diretório raiz (útil em testes). Default: `getAppPaths().workspace(id)`. */
  readonly workspaceRoot?: string;
}

/**
 * Acumulador opcional para `read()` — incrementa `skipped` por linha
 * corrompida ignorada. Caller que precisa rastrear gaps de corrupção
 * (recovery, debug ZIP, métrica de saúde) passa o objeto e lê depois.
 */
export interface ReadStats {
  skipped: number;
}

export class SessionEventStore {
  private readonly workspaceRoot: string;

  constructor(workspaceId: string, options: SessionEventStoreOptions = {}) {
    this.workspaceRoot = options.workspaceRoot ?? getAppPaths().workspace(workspaceId);
  }

  /** Caminho do arquivo JSONL desta sessão. */
  path(sessionId: string): string {
    return join(this.workspaceRoot, 'sessions', sessionId, EVENTS_FILE);
  }

  /**
   * Acrescenta um evento. Valida com `SessionEventSchema` antes de
   * escrever — dados corrompidos não entram no log.
   */
  async append(sessionId: string, event: SessionEvent): Promise<void> {
    const validated = SessionEventSchema.parse(event);
    const line = `${JSON.stringify(validated)}\n`;
    const path = this.path(sessionId);
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, line, 'utf8');
  }

  /**
   * Lê eventos em ordem de append. Linhas corrompidas são SKIPPED + warn
   * (CR7-21). Para callers que precisam saber sobre gaps de corrupção,
   * passar `stats` — `stats.skipped` é incrementado por linha skippada.
   *
   * CR8-12: agregadores (`readAfter`, `count`, `truncateAfter`) não tinham
   * sinal de "houve corrupção?" e retornavam números assimétricos com a
   * realidade do JSONL. `stats` resolve isso sem mudar a assinatura
   * principal — caller passa o objeto se quer rastrear.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: (reason: replay JSONL combina stream open ENOENT, buffer chunking, per-line skip-on-corruption (CR7-21), stats accumulator (CR8-12) e tail-flush — separar perde a continuidade do buffering linear)
  async *read(sessionId: string, stats?: ReadStats): AsyncGenerator<SessionEvent> {
    const path = this.path(sessionId);
    let stream: ReturnType<typeof createReadStream>;
    try {
      stream = createReadStream(path, { encoding: 'utf8' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }

    let buffer = '';
    let lineNumber = 0;
    try {
      for await (const chunk of stream) {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          lineNumber++;
          if (!line.trim()) continue;
          // CR7-21: linha corrompida (write parcial em crash, FS corruption)
          // não pode quebrar replay inteiro. Antes: parseLine throw → toda
          // a sessão ficava inacessível por uma única linha ruim. Agora:
          // log warn + skip → recuperamos eventos remanescentes.
          try {
            yield parseLine(line);
          } catch (parseErr) {
            if (stats) stats.skipped += 1;
            log.warn(
              { sessionId, lineNumber, err: String(parseErr) },
              'corrupted JSONL line skipped during replay',
            );
          }
        }
      }
      if (buffer.trim()) {
        lineNumber++;
        try {
          yield parseLine(buffer);
        } catch (parseErr) {
          if (stats) stats.skipped += 1;
          log.warn(
            { sessionId, lineNumber, err: String(parseErr) },
            'corrupted JSONL final line skipped during replay',
          );
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
  }

  /**
   * Eventos com `sequenceNumber > afterSequence` — recovery após checkpoint.
   *
   * CR8-12: emite warn estruturado se houve corrupção mid-stream. Replay
   * pós-checkpoint que tropeça em linha ruim mantém o gap sem que o caller
   * (replay.ts) tenha visibilidade. Stats no log permite operador correlacionar
   * "session X tem checkpoint stuck" com "session X teve N linhas skipped".
   */
  async readAfter(sessionId: string, afterSequence: number): Promise<SessionEvent[]> {
    const out: SessionEvent[] = [];
    const stats: ReadStats = { skipped: 0 };
    for await (const event of this.read(sessionId, stats)) {
      if (event.sequenceNumber > afterSequence) out.push(event);
    }
    if (stats.skipped > 0) {
      log.warn(
        { sessionId, afterSequence, skippedLines: stats.skipped, returned: out.length },
        'readAfter completed with corrupted lines skipped — sequence gaps possible',
      );
    }
    return out;
  }

  /**
   * Total de eventos registrados (inclusive eventos passados).
   *
   * CR8-12: idem readAfter — warn se corrupção. Caller que precisar do
   * skipped count exato deve usar `read()` direto com `stats`.
   */
  async count(sessionId: string): Promise<number> {
    let n = 0;
    const stats: ReadStats = { skipped: 0 };
    for await (const _ of this.read(sessionId, stats)) n += 1;
    if (stats.skipped > 0) {
      log.warn(
        { sessionId, valid: n, skippedLines: stats.skipped },
        'count() completed with corrupted lines skipped — return value undercounts physical lines',
      );
    }
    return n;
  }

  /**
   * Remove eventos com `sequenceNumber > afterSequence`. Destrutivo.
   * Usado por retry/truncate (TASK-11-00-08). Write é atômico via tmp+rename:
   * falha no meio do processo não deixa log parcial. Retorna número de eventos
   * removidos; no-op se arquivo não existe.
   */
  async truncateAfter(sessionId: string, afterSequence: number): Promise<number> {
    const path = this.path(sessionId);
    const kept: SessionEvent[] = [];
    let total = 0;
    for await (const event of this.read(sessionId)) {
      total += 1;
      if (event.sequenceNumber <= afterSequence) kept.push(event);
    }
    const removed = total - kept.length;
    if (removed === 0) return 0;

    if (kept.length === 0) {
      try {
        await unlink(path);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
      return removed;
    }

    const tmp = `${path}.tmp`;
    const body = `${kept.map((e) => JSON.stringify(e)).join('\n')}\n`;
    await writeFile(tmp, body, 'utf8');
    await rename(tmp, path);
    return removed;
  }

  /**
   * CR4-15: limpa arquivos `.tmp` órfãos deixados por `truncateAfter` que
   * crashou entre `writeFile(tmp)` e `rename(tmp, path)`. Chamada idempotente
   * recomendada no boot do desktop main process. Remove apenas `.tmp` mais
   * antigos que `ORPHAN_TMP_MAX_AGE_MS` para evitar corrida com truncate
   * em curso.
   */
  async cleanupOrphanTmp(sessionId: string): Promise<number> {
    const dir = dirname(this.path(sessionId));
    let removed = 0;
    try {
      const entries = await readdir(dir);
      const cutoff = Date.now() - ORPHAN_TMP_MAX_AGE_MS;
      for (const entry of entries) {
        if (!entry.endsWith('.tmp')) continue;
        const tmpPath = join(dir, entry);
        try {
          const info = await stat(tmpPath);
          if (info.mtimeMs >= cutoff) continue;
          await unlink(tmpPath);
          removed += 1;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
          log.warn({ err, tmpPath }, 'orphan tmp cleanup skipped');
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
      log.warn({ err, dir }, 'orphan tmp scan failed');
    }
    return removed;
  }
}

function parseLine(line: string): SessionEvent {
  return SessionEventSchema.parse(JSON.parse(line));
}
