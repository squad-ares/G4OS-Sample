/**
 * Step `sessions` — converte sessões V1 (`session.json` + `session.jsonl`)
 * em sessões V2 event-sourced (registro SQLite + eventos JSONL validados).
 *
 * Layout V1 esperado:
 *   `<v1>/workspaces/<wid>/sessions/<sid>/session.json` (metadata)
 *   `<v1>/workspaces/<wid>/sessions/<sid>/session.jsonl` (eventos legacy)
 *
 * Mapeamento de eventos: tentativa best-effort. V1 events conhecidos
 * (`message.added`, `tool.invoked`, `tool.completed`) são mapeados pra
 * shape V2 + validados via `SessionEventSchema`. Eventos com type
 * desconhecido viram warning + skip (não-fatal).
 *
 * `eventId`/`sequenceNumber`/`timestamp` ausentes em V1 são gerados:
 *   - `eventId`: `randomUUID()` se faltar
 *   - `sequenceNumber`: índice 0..N-1 da posição na JSONL
 *   - `timestamp`: do próprio evento se houver, senão `session.createdAt + i`
 *
 * Idempotente: `sessionWriter.existsSession(wid, sid)` skip antes de criar.
 */

import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { AppError } from '@g4os/kernel/errors';
import { SessionEventSchema } from '@g4os/kernel/schemas';
import { ok, type Result } from 'neverthrow';
import { z } from 'zod';
import type { StepContext, StepResult, V2SessionMetadata } from './contract.ts';

const V1SessionMetaSchema = z.object({
  id: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  name: z.string().optional(),
  provider: z.string().optional(),
  modelId: z.string().optional(),
  createdAt: z.union([z.number(), z.string()]).optional(),
  updatedAt: z.union([z.number(), z.string()]).optional(),
});

type V1SessionMeta = z.infer<typeof V1SessionMetaSchema>;

const KNOWN_EVENT_TYPES = new Set([
  'session.created',
  'session.renamed',
  'message.added',
  'message.updated',
  'tool.invoked',
  'tool.completed',
]);

interface SessionContext {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly metaPath: string;
  readonly jsonlPath: string;
}

interface AggregateStats {
  migrated: number;
  skipped: number;
  bytes: number;
  warnings: string[];
}

export async function migrateSessions(ctx: StepContext): Promise<Result<StepResult, AppError>> {
  const { sourcePath, stepIndex, stepCount, onProgress, dryRun, options } = ctx;
  const wsRoot = join(sourcePath, 'workspaces');

  if (!existsSync(wsRoot)) {
    onProgress({
      stepKind: 'sessions',
      stepIndex,
      stepCount,
      stepProgress: 1,
      message: 'sessions: V1 sem workspaces/ — skip',
    });
    return ok(emptyResult());
  }

  const allSessions = await listAllSessions(wsRoot);
  if (allSessions.length === 0) {
    onProgress({
      stepKind: 'sessions',
      stepIndex,
      stepCount,
      stepProgress: 1,
      message: 'sessions: 0 sessões em V1',
    });
    return ok(emptyResult());
  }

  const stats: AggregateStats = { migrated: 0, skipped: 0, bytes: 0, warnings: [] };

  for (let i = 0; i < allSessions.length; i++) {
    const session = allSessions[i];
    if (!session) continue;

    onProgress({
      stepKind: 'sessions',
      stepIndex,
      stepCount,
      stepProgress: i / allSessions.length,
      message: `sessions: ${session.workspaceId}/${session.sessionId}`,
    });

    await migrateOneSession(session, dryRun, options.sessionWriter, stats);
  }

  onProgress({
    stepKind: 'sessions',
    stepIndex,
    stepCount,
    stepProgress: 1,
    message: `sessions: ${stats.migrated} migradas, ${stats.skipped} skip`,
  });

  return ok({
    itemsMigrated: stats.migrated,
    itemsSkipped: stats.skipped,
    bytesProcessed: stats.bytes,
    nonFatalWarnings: stats.warnings,
  });
}

async function listAllSessions(wsRoot: string): Promise<readonly SessionContext[]> {
  const out: SessionContext[] = [];
  let workspaces: string[];
  try {
    const dirents = await readdir(wsRoot, { withFileTypes: true });
    workspaces = dirents.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return out;
  }

  for (const wid of workspaces) {
    const sessionsDir = join(wsRoot, wid, 'sessions');
    if (!existsSync(sessionsDir)) continue;
    let sessions: string[];
    try {
      const dirents = await readdir(sessionsDir, { withFileTypes: true });
      sessions = dirents.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      continue;
    }
    for (const sid of sessions) {
      const sessionPath = join(sessionsDir, sid);
      out.push({
        workspaceId: wid,
        sessionId: sid,
        metaPath: join(sessionPath, 'session.json'),
        jsonlPath: join(sessionPath, 'session.jsonl'),
      });
    }
  }
  return out;
}

async function migrateOneSession(
  session: SessionContext,
  dryRun: boolean,
  writer: StepContext['options']['sessionWriter'],
  stats: AggregateStats,
): Promise<void> {
  const meta = await readSessionMeta(session, stats);
  if (!meta) {
    stats.skipped++;
    return;
  }

  // Modo read-only: conta bytes via stat + parse sem persistir.
  if (!writer || dryRun) {
    stats.bytes += await fileBytes(session.jsonlPath);
    stats.migrated++;
    return;
  }

  if (await writer.existsSession(session.workspaceId, session.sessionId)) {
    stats.skipped++;
    return;
  }

  try {
    await writer.createSession(meta);
  } catch (cause) {
    stats.warnings.push(
      `${session.workspaceId}/${session.sessionId}: createSession falhou (${describe(cause)})`,
    );
    stats.skipped++;
    return;
  }

  // F-CR40-7: bytes via stat, stream processado event-by-event (não carrega
  // JSONL inteiro em memória — sessões grandes com base64 inline podem ter dezenas
  // de MB; sem stream, pico O(maior_sessão) levava a OOM em máquinas limitadas).
  const jsonlBytes = await fileBytes(session.jsonlPath);
  stats.bytes += jsonlBytes;

  let lineIndex = 0;
  let appended = 0;
  let totalLines = 0;
  let appendFailed = false;

  for await (const line of streamJsonlLines(session.jsonlPath)) {
    totalLines++;
    const v2Event = mapV1EventToV2(line, session, lineIndex, meta.createdAt);
    lineIndex++;
    if (!v2Event) {
      stats.warnings.push(
        `${session.sessionId}#${lineIndex - 1}: evento V1 não mapeável — type "${(line['type'] as string) ?? '(?)'}" skipado`,
      );
      continue;
    }
    try {
      await writer.appendEvent(session.sessionId, v2Event);
      appended++;
    } catch (cause) {
      // F-CR40-10: falha em appendEvent é escalada para erro da sessão.
      // Continuar após falha de IO deixa sessão V2 com eventos faltando;
      // o próximo run via existsSession retorna true e skipa permanentemente.
      // Registramos o erro e marcamos sessão como falha (não incrementa migrated).
      stats.warnings.push(
        `${session.sessionId}#${lineIndex - 1}: appendEvent falhou — sessão marcada como parcial (${describe(cause)})`,
      );
      appendFailed = true;
      break;
    }
  }

  if (appendFailed) {
    // Não incrementa migrated — sessão ficou parcial; re-run precisa de
    // --force ou tratamento específico pelo caller.
    stats.skipped++;
    return;
  }

  if (appended === 0 && totalLines > 0) {
    stats.warnings.push(
      `${session.sessionId}: 0 eventos válidos de ${totalLines} — sessão vazia em V2`,
    );
  }

  stats.migrated++;
}

async function readSessionMeta(
  session: SessionContext,
  stats: AggregateStats,
): Promise<V2SessionMetadata | null> {
  if (!existsSync(session.metaPath)) {
    stats.warnings.push(`${session.sessionId}: session.json ausente — skip`);
    return null;
  }

  let raw: string;
  try {
    raw = await readFile(session.metaPath, 'utf-8');
    stats.bytes += Buffer.byteLength(raw, 'utf-8');
  } catch (cause) {
    stats.warnings.push(`${session.sessionId}: falha lendo session.json (${describe(cause)})`);
    return null;
  }

  let v1Meta: V1SessionMeta;
  try {
    v1Meta = V1SessionMetaSchema.parse(JSON.parse(raw));
  } catch (cause) {
    stats.warnings.push(`${session.sessionId}: session.json malformado (${describe(cause)})`);
    return null;
  }

  const id = v1Meta.id ?? session.sessionId;
  const workspaceId = v1Meta.workspaceId ?? session.workspaceId;
  const createdAt = toEpoch(v1Meta.createdAt) ?? Date.now();
  const updatedAt = toEpoch(v1Meta.updatedAt) ?? createdAt;
  const meta: V2SessionMetadata = {
    id,
    workspaceId,
    name: v1Meta.name ?? 'Imported session',
    ...(v1Meta.provider === undefined ? {} : { provider: v1Meta.provider }),
    ...(v1Meta.modelId === undefined ? {} : { modelId: v1Meta.modelId }),
    createdAt,
    updatedAt,
  };
  return meta;
}

/**
 * F-CR40-7: Lê JSONL linha a linha via stream (não carrega em memória).
 * Linhas corrompidas são puladas silenciosamente (JSONL legacy tem linhas
 * parciais por crash mid-write em V1).
 */
async function* streamJsonlLines(path: string): AsyncGenerator<Record<string, unknown>> {
  if (!existsSync(path)) return;
  const rl = createInterface({
    input: createReadStream(path, { encoding: 'utf8' }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (typeof parsed === 'object' && parsed !== null) {
        yield parsed as Record<string, unknown>;
      }
    } catch {
      // Linha corrompida — pula (JSONL legacy frequentemente tem linhas
      // parciais por crash mid-write no V1).
    }
  }
}

async function fileBytes(path: string): Promise<number> {
  if (!existsSync(path)) return 0;
  try {
    const s = await stat(path);
    return s.isFile() ? s.size : 0;
  } catch {
    return 0;
  }
}

function mapV1EventToV2(
  v1Event: Record<string, unknown>,
  session: SessionContext,
  indexInJsonl: number,
  fallbackTimestamp: number,
): unknown {
  const type = typeof v1Event['type'] === 'string' ? v1Event['type'] : undefined;
  if (!type || !KNOWN_EVENT_TYPES.has(type)) return null;

  // Campos comuns: gera defaults quando V1 não traz.
  const eventId = typeof v1Event['eventId'] === 'string' ? v1Event['eventId'] : randomUUID();
  const timestamp =
    typeof v1Event['timestamp'] === 'number'
      ? v1Event['timestamp']
      : fallbackTimestamp + indexInJsonl;
  const sequenceNumber =
    typeof v1Event['sequenceNumber'] === 'number' ? v1Event['sequenceNumber'] : indexInJsonl;

  const candidate = {
    ...v1Event,
    eventId,
    sessionId: session.sessionId,
    sequenceNumber,
    timestamp,
    type,
  };

  // Validação Zod V2 — events que não passam viram null (warning no caller).
  // Garantia que só V2-shape válido entra na JSONL append-only.
  const result = SessionEventSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

function toEpoch(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Date.parse(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function emptyResult(): StepResult {
  return { itemsMigrated: 0, itemsSkipped: 0, bytesProcessed: 0, nonFatalWarnings: [] };
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
