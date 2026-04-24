import { describe, expect, it } from 'vitest';
import {
  isMainToWorker,
  isWorkerToMain,
  type MainToWorker,
  type WorkerToMain,
} from '../protocol.ts';

describe('worker protocol / isMainToWorker', () => {
  it.each<MainToWorker>([
    { type: 'send-message', payload: { text: 'oi' }, turnId: 't1' },
    { type: 'interrupt', turnId: 't1' },
    { type: 'health-check', requestId: 'r1' },
    { type: 'shutdown', reason: 'app-quit' },
  ])('aceita comando válido: $type', (cmd) => {
    expect(isMainToWorker(cmd)).toBe(true);
  });

  it('rejeita null e primitivos', () => {
    expect(isMainToWorker(null)).toBe(false);
    expect(isMainToWorker(undefined)).toBe(false);
    expect(isMainToWorker('send-message')).toBe(false);
    expect(isMainToWorker(42)).toBe(false);
  });

  it('rejeita objeto sem type', () => {
    expect(isMainToWorker({})).toBe(false);
    expect(isMainToWorker({ payload: 'x' })).toBe(false);
  });

  it('rejeita type desconhecido', () => {
    expect(isMainToWorker({ type: 'random' })).toBe(false);
    expect(isMainToWorker({ type: 'ready' })).toBe(false); // esse é WorkerToMain
  });
});

describe('worker protocol / isWorkerToMain', () => {
  it.each<WorkerToMain>([
    { type: 'ready', sessionId: 's1', pid: 1234 },
    { type: 'session-event', event: { type: 'message.added' } },
    { type: 'turn-stream', event: { type: 'turn.started' } },
    { type: 'health-response', rss: 100, heap: 50, status: 'ok' },
    { type: 'error', code: 'x', message: 'boom' },
  ])('aceita evento válido: $type', (evt) => {
    expect(isWorkerToMain(evt)).toBe(true);
  });

  it('rejeita type de MainToWorker', () => {
    expect(isWorkerToMain({ type: 'send-message' })).toBe(false);
    expect(isWorkerToMain({ type: 'shutdown' })).toBe(false);
  });

  it('rejeita objetos sem type', () => {
    expect(isWorkerToMain({})).toBe(false);
    expect(isWorkerToMain(null)).toBe(false);
  });
});
