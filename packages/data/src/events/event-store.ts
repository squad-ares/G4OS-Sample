/**
 * Event store append-only em JSONL (1 arquivo por sessão).
 *
 * Fonte de verdade da sessão é o log de eventos; projections em SQLite
 * (sessions, messages_index, FTS5) são reconstruíveis via replay. Ver
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
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { type SessionEvent, SessionEventSchema } from '@g4os/kernel/schemas';
import { getAppPaths } from '@g4os/platform';

const EVENTS_FILE = 'events.jsonl';

export interface SessionEventStoreOptions {
  /** Override de diretório raiz (útil em testes). Default: `getAppPaths().workspace(id)`. */
  readonly workspaceRoot?: string;
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
   * Lê eventos em ordem de append. Lança se o arquivo estiver
   * corrompido (JSON inválido ou schema inválido).
   */
  async *read(sessionId: string): AsyncGenerator<SessionEvent> {
    const path = this.path(sessionId);
    let stream: ReturnType<typeof createReadStream>;
    try {
      stream = createReadStream(path, { encoding: 'utf8' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }

    let buffer = '';
    try {
      for await (const chunk of stream) {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) yield parseLine(line);
        }
      }
      if (buffer.trim()) yield parseLine(buffer);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw err;
    }
  }

  /** Eventos com `sequenceNumber > afterSequence` — recovery após checkpoint. */
  async readAfter(sessionId: string, afterSequence: number): Promise<SessionEvent[]> {
    const out: SessionEvent[] = [];
    for await (const event of this.read(sessionId)) {
      if (event.sequenceNumber > afterSequence) out.push(event);
    }
    return out;
  }

  /** Total de eventos registrados (inclusive eventos passados). */
  async count(sessionId: string): Promise<number> {
    let n = 0;
    for await (const _ of this.read(sessionId)) n += 1;
    return n;
  }
}

function parseLine(line: string): SessionEvent {
  return SessionEventSchema.parse(JSON.parse(line));
}
