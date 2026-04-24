/**
 * Protocolo main ↔ session worker — OUTLIER-11.
 *
 * Mensagens transitam via `utilityProcess.postMessage()` em ambas as direções.
 * O canal é assíncrono, ordenado, e o payload deve ser estruturado (clonável
 * pelo structured clone algorithm do Electron).
 *
 * Convenções:
 *  - `MainToWorker` são comandos (main dirige o worker).
 *  - `WorkerToMain` são eventos (worker reporta para main, que re-emite no
 *    `SessionEventBus` local e no stream tRPC para o renderer).
 *  - `requestId` opcional permite correlacionar resposta a uma requisição
 *    específica (ex: `health-check` → `health-response`).
 *
 * Divisão de responsabilidade (ADR-0030):
 *  - Main continua dono de persistência (SQLite), vault (safeStorage) e
 *    event log JSONL.
 *  - Worker roda apenas agent SDKs + streaming + acumulação de chunks.
 *  - Credenciais atravessam o canal **por turno** em `dispatch.credentials`
 *    — nunca ficam residentes no worker entre turnos.
 */

import type { AgentConfig, AgentDoneReason } from '@g4os/agents/interface';
import type { Message, SessionId } from '@g4os/kernel/types';

export type WorkerHealthStatus = 'ok' | 'degraded' | 'unhealthy';

export interface CredentialBundle {
  readonly anthropicApiKey?: string;
  readonly openaiApiKey?: string;
  readonly googleApiKey?: string;
}

export interface MainToWorkerDispatch {
  readonly type: 'dispatch';
  readonly sessionId: SessionId;
  readonly turnId: string;
  readonly messages: readonly Message[];
  readonly config: AgentConfig;
  readonly credentials: CredentialBundle;
}

export interface MainToWorkerSendMessage {
  readonly type: 'send-message';
  readonly payload: unknown;
  readonly turnId?: string;
  readonly requestId?: string;
}

export interface MainToWorkerInterrupt {
  readonly type: 'interrupt';
  readonly turnId?: string;
  readonly requestId?: string;
}

export interface MainToWorkerHealthCheck {
  readonly type: 'health-check';
  readonly requestId?: string;
}

export interface MainToWorkerShutdown {
  readonly type: 'shutdown';
  readonly reason?: string;
  readonly requestId?: string;
}

export type MainToWorker =
  | MainToWorkerDispatch
  | MainToWorkerSendMessage
  | MainToWorkerInterrupt
  | MainToWorkerHealthCheck
  | MainToWorkerShutdown;

export type MainToWorkerType = MainToWorker['type'];

export interface WorkerToMainReady {
  readonly type: 'ready';
  readonly sessionId: string;
  readonly pid: number;
}

export interface WorkerToMainSessionEvent {
  readonly type: 'session-event';
  readonly event: unknown;
}

export interface WorkerToMainTurnStream {
  readonly type: 'turn-stream';
  readonly event: unknown;
}

/**
 * Emitido uma única vez ao final de um turno bem-sucedido ou cancelado,
 * carregando o payload acumulado para o main persistir como assistant
 * message e fechar o evento `turn.done` no bus.
 */
export interface WorkerToMainTurnComplete {
  readonly type: 'turn-complete';
  readonly sessionId: string;
  readonly turnId: string;
  readonly reason: AgentDoneReason;
  readonly text: string;
  readonly thinking: string;
  readonly usage: { readonly input: number; readonly output: number };
  readonly modelId: string;
}

export interface WorkerToMainHealthResponse {
  readonly type: 'health-response';
  readonly requestId?: string;
  readonly rss: number;
  readonly heap: number;
  readonly status: WorkerHealthStatus;
}

export interface WorkerToMainError {
  readonly type: 'error';
  readonly code: string;
  readonly message: string;
  readonly requestId?: string;
  readonly turnId?: string;
}

export type WorkerToMain =
  | WorkerToMainReady
  | WorkerToMainSessionEvent
  | WorkerToMainTurnStream
  | WorkerToMainTurnComplete
  | WorkerToMainHealthResponse
  | WorkerToMainError;

export type WorkerToMainType = WorkerToMain['type'];

const MAIN_TO_WORKER_TYPES = new Set<MainToWorkerType>([
  'dispatch',
  'send-message',
  'interrupt',
  'health-check',
  'shutdown',
]);

const WORKER_TO_MAIN_TYPES = new Set<WorkerToMainType>([
  'ready',
  'session-event',
  'turn-stream',
  'turn-complete',
  'health-response',
  'error',
]);

export function isMainToWorker(msg: unknown): msg is MainToWorker {
  if (typeof msg !== 'object' || msg === null) return false;
  const record = msg as Record<string, unknown>;
  const type = record['type'];
  return typeof type === 'string' && MAIN_TO_WORKER_TYPES.has(type as MainToWorkerType);
}

export function isWorkerToMain(msg: unknown): msg is WorkerToMain {
  if (typeof msg !== 'object' || msg === null) return false;
  const record = msg as Record<string, unknown>;
  const type = record['type'];
  return typeof type === 'string' && WORKER_TO_MAIN_TYPES.has(type as WorkerToMainType);
}
