/**
 * Entry point executado em `utilityProcess` isolado para uma sessão.
 *
 * Cada sessão ativa spawnsa um worker deste tipo. O sessionId chega
 * via `process.argv[2]` (configurado pelo `SessionManager`), evitando
 * leitura de `process.env` bloqueada pelo lint.
 *
 * Protocolo (parent ↔ worker):
 *   - `send-message` / `interrupt` vindos do main → eventos emitidos de
 *     volta como `session-event`.
 *   - `health-check` → `health-response` com memória atual.
 *   - `shutdown` → flush + `process.exit(0)`.
 */

import { createLogger } from '@g4os/kernel/logger';

interface WorkerMessage {
  readonly type: 'send-message' | 'interrupt' | 'shutdown' | 'health-check';
  readonly payload?: unknown;
  readonly requestId?: string;
  readonly reason?: string;
}

interface ParentPortLike {
  on(event: 'message', handler: (msg: unknown) => void): void;
  postMessage(msg: unknown): void;
}

const MEM_DEGRADED_BYTES = 400 * 1024 * 1024;
const FLUSH_SETTLE_MS = 50;

const log = createLogger('session-worker');
const sessionId = readSessionId();

bootstrap().catch((err: unknown) => {
  log.fatal({ err, sessionId }, 'session worker bootstrap failed');
  process.exit(1);
});

async function bootstrap(): Promise<void> {
  await Promise.resolve();
  const parentPort = getParentPort();
  if (!parentPort) {
    log.warn({ sessionId }, 'parentPort indisponível; worker ocioso');
    return;
  }

  parentPort.on('message', (msg) => {
    if (!isWorkerMessage(msg)) return;
    handleMessage(msg, parentPort).catch((err: unknown) => {
      log.error({ err, type: msg.type, sessionId }, 'falha no handler do worker');
    });
  });

  log.info({ sessionId }, 'session worker pronto');
}

async function handleMessage(msg: WorkerMessage, parentPort: ParentPortLike): Promise<void> {
  switch (msg.type) {
    case 'send-message':
      parentPort.postMessage({
        type: 'session-event',
        event: { type: 'message-received', payload: msg.payload },
      });
      return;
    case 'interrupt':
      parentPort.postMessage({
        type: 'session-event',
        event: { type: 'interrupted', payload: null },
      });
      return;
    case 'health-check': {
      const mem = process.memoryUsage();
      parentPort.postMessage({
        type: 'health-response',
        requestId: msg.requestId,
        rss: mem.rss,
        heap: mem.heapUsed,
        status: mem.rss < MEM_DEGRADED_BYTES ? 'ok' : 'degraded',
      });
      return;
    }
    case 'shutdown':
      log.info({ sessionId, reason: msg.reason ?? 'unknown' }, 'worker encerrando');
      await flushInFlight();
      process.exit(0);
  }
}

async function flushInFlight(): Promise<void> {
  // Ponto de extensão: o runtime real aguardaria operações em voo.
  await new Promise<void>((resolve) => setTimeout(resolve, FLUSH_SETTLE_MS));
}

function readSessionId(): string {
  const fromArgv = process.argv[2];
  return fromArgv && fromArgv.length > 0 ? fromArgv : 'unknown';
}

function getParentPort(): ParentPortLike | null {
  const maybe = (process as unknown as { parentPort?: ParentPortLike }).parentPort;
  return maybe ?? null;
}

function isWorkerMessage(msg: unknown): msg is WorkerMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const record = msg as Record<string, unknown>;
  const type = record['type'];
  return (
    type === 'send-message' ||
    type === 'interrupt' ||
    type === 'shutdown' ||
    type === 'health-check'
  );
}
