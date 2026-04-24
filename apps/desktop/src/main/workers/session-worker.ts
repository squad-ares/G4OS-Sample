/**
 * Session Worker — OUTLIER-11 Phase 2b.
 *
 * Executa em `utilityProcess` isolado por sessionId. Comunica com o main via
 * `process.parentPort` usando o protocolo tipado em `./protocol.ts`.
 *
 * Responsabilidades:
 *  - Responder a comandos: `dispatch`, `interrupt`, `health-check`,
 *    `send-message` (legado), `shutdown`.
 *  - Rodar turnos de agent via `WorkerTurnRunner` e streamar eventos de
 *    volta para o main.
 *  - Emitir `turn-complete` ao fim de cada turno para o main persistir a
 *    mensagem do assistant.
 *
 * Não faz:
 *  - Persistência SQLite (fica no main)
 *  - Acesso a `safeStorage` (credenciais chegam por `dispatch.credentials`)
 *  - Hot reload de factories entre turnos (cada turno reconstrói com as
 *    credenciais recebidas; cache fica a cargo do main se for caso).
 *
 * Contratos importantes (ADR-0030):
 *  - sessionId vem em `process.argv[2]` (nunca env)
 *  - flush em deadline < 3s no shutdown
 *  - emite `ready` assim que parentPort está pronto
 */

import { createClaudeFactory, DirectApiProvider } from '@g4os/agents/claude';
import { createGoogleFactory } from '@g4os/agents/google';
import { AgentRegistry } from '@g4os/agents/interface';
import { createOpenAIFactory } from '@g4os/agents/openai';
import { createLogger } from '@g4os/kernel/logger';
import {
  type CredentialBundle,
  isMainToWorker,
  type MainToWorker,
  type WorkerHealthStatus,
  type WorkerToMain,
} from './protocol.ts';
import { WorkerTurnRunner } from './turn-runner.ts';

interface ParentPortLike {
  on(event: 'message', handler: (msg: unknown) => void): void;
  postMessage(msg: WorkerToMain): void;
}

const MEM_DEGRADED_BYTES = 400 * 1024 * 1024;
const MEM_UNHEALTHY_BYTES = 500 * 1024 * 1024;
const FLUSH_DEADLINE_MS = 3_000;
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

  const runner = new WorkerTurnRunner({
    registry: new AgentRegistry(),
    post: (msg) => parentPort.postMessage(msg),
    buildRegistry: buildRegistryFromCredentials,
  });

  parentPort.on('message', (msg) => {
    if (!isMainToWorker(msg)) {
      log.warn({ sessionId, msg }, 'mensagem inválida descartada');
      return;
    }
    handleMessage(msg, parentPort, runner).catch((err: unknown) => {
      log.error({ err, type: msg.type, sessionId }, 'falha no handler do worker');
      parentPort.postMessage({
        type: 'error',
        code: 'worker.handler_failed',
        message: err instanceof Error ? err.message : String(err),
      });
    });
  });

  parentPort.postMessage({
    type: 'ready',
    sessionId,
    pid: process.pid,
  });

  log.info({ sessionId, pid: process.pid }, 'session worker pronto');
}

async function handleMessage(
  msg: MainToWorker,
  parentPort: ParentPortLike,
  runner: WorkerTurnRunner,
): Promise<void> {
  switch (msg.type) {
    case 'dispatch':
      await runner.dispatch(msg);
      return;

    case 'send-message':
      // Legado — mantido para compatibilidade com SessionManager antes do
      // flag `useSessionWorker` assumir o caminho de `dispatch`.
      parentPort.postMessage({
        type: 'session-event',
        event: { type: 'message-received', payload: msg.payload, turnId: msg.turnId },
      });
      return;

    case 'interrupt':
      runner.interrupt(msg.turnId);
      parentPort.postMessage({
        type: 'session-event',
        event: { type: 'interrupted', turnId: msg.turnId },
      });
      return;

    case 'health-check': {
      const mem = process.memoryUsage();
      const status = classifyMemory(mem.rss);
      parentPort.postMessage({
        type: 'health-response',
        ...(msg.requestId ? { requestId: msg.requestId } : {}),
        rss: mem.rss,
        heap: mem.heapUsed,
        status,
      });
      return;
    }

    case 'shutdown':
      log.info({ sessionId, reason: msg.reason ?? 'unknown' }, 'worker encerrando');
      runner.interrupt();
      await flushInFlight();
      process.exit(0);
  }
}

function buildRegistryFromCredentials(creds: CredentialBundle): AgentRegistry {
  const registry = new AgentRegistry();
  if (creds.anthropicApiKey) {
    const provider = new DirectApiProvider({ apiKey: creds.anthropicApiKey });
    registry.register(createClaudeFactory({ resolveProvider: () => provider }));
  }
  if (creds.openaiApiKey) {
    registry.register(createOpenAIFactory({ resolveApiKey: () => creds.openaiApiKey ?? '' }));
  }
  if (creds.googleApiKey) {
    registry.register(createGoogleFactory({ resolveApiKey: () => creds.googleApiKey ?? '' }));
  }
  return registry;
}

function classifyMemory(rss: number): WorkerHealthStatus {
  if (rss >= MEM_UNHEALTHY_BYTES) return 'unhealthy';
  if (rss >= MEM_DEGRADED_BYTES) return 'degraded';
  return 'ok';
}

async function flushInFlight(): Promise<void> {
  // Phase 2b: aguarda event loop; Phase 4 aguarda AbortController + queue drain.
  await Promise.race([
    new Promise<void>((resolve) => setTimeout(resolve, FLUSH_SETTLE_MS)),
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('flush timeout')), FLUSH_DEADLINE_MS),
    ),
  ]).catch((err: unknown) => {
    log.warn({ err, sessionId }, 'flush deadline excedido');
  });
}

function readSessionId(): string {
  const fromArgv = process.argv[2];
  return fromArgv && fromArgv.length > 0 ? fromArgv : 'unknown';
}

function getParentPort(): ParentPortLike | null {
  const maybe = (process as unknown as { parentPort?: ParentPortLike }).parentPort;
  return maybe ?? null;
}
