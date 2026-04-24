import { type SessionBusEvent, SessionEventBus } from '@g4os/session-runtime';
import { describe, expect, it } from 'vitest';
import { createFakeRuntime } from '../../__tests__/fake-runtime.ts';
import { ProcessSupervisor } from '../../process/supervisor.ts';
import type { WorkerToMain } from '../../workers/protocol.ts';
import { SessionManager } from '../session-manager.ts';

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('SessionManager — integração com fake utilityProcess', () => {
  it('spawnar worker, encaminha dispatch, entrega eventos no bus', async () => {
    const { runtime, processes } = createFakeRuntime();
    const supervisor = new ProcessSupervisor(runtime);
    const bus = new SessionEventBus();
    const sessions = new SessionManager(supervisor, { eventBus: bus });

    const events: SessionBusEvent[] = [];
    bus.subscribe('sess-1', (e) => events.push(e));

    await sessions.dispatchTurn({
      sessionId: 'sess-1',
      turnId: 'turn-1',
      messages: [],
      config: { connectionSlug: 'anthropic-direct', modelId: 'claude-sonnet-4-6' },
      credentials: { anthropicApiKey: 'sk-test' },
    });

    expect(processes).toHaveLength(1);
    const worker = processes[0];
    expect(worker?.args).toEqual(['sess-1']);
    expect(worker?.posted[0]).toMatchObject({ type: 'dispatch', sessionId: 'sess-1' });

    const turnStarted: WorkerToMain = {
      type: 'turn-stream',
      event: { type: 'turn.started', sessionId: 'sess-1', turnId: 'turn-1' },
    };
    const turnChunk: WorkerToMain = {
      type: 'turn-stream',
      event: {
        type: 'turn.text_chunk',
        sessionId: 'sess-1',
        turnId: 'turn-1',
        text: 'olá',
      },
    };
    const turnComplete: WorkerToMain = {
      type: 'turn-complete',
      sessionId: 'sess-1',
      turnId: 'turn-1',
      reason: 'stop',
      text: 'olá',
      thinking: '',
      usage: { input: 5, output: 2 },
      modelId: 'claude-sonnet-4-6',
    };

    worker?.simulateMessage(turnStarted);
    worker?.simulateMessage(turnChunk);
    worker?.simulateMessage(turnComplete);

    await flushMicrotasks();

    const types = events.map((e) => e.type);
    expect(types).toContain('turn.started');
    expect(types).toContain('turn.text_chunk');
    expect(types).toContain('turn.complete');

    supervisor.dispose();
  });

  it('mensagens inválidas do worker são descartadas sem quebrar o bus', async () => {
    const { runtime, processes } = createFakeRuntime();
    const supervisor = new ProcessSupervisor(runtime);
    const bus = new SessionEventBus();
    const sessions = new SessionManager(supervisor, { eventBus: bus });

    const events: SessionBusEvent[] = [];
    bus.subscribe('sess-2', (e) => events.push(e));

    await sessions.dispatchTurn({
      sessionId: 'sess-2',
      turnId: 'turn-2',
      messages: [],
      config: { connectionSlug: 'anthropic-direct', modelId: 'claude-sonnet-4-6' },
      credentials: {},
    });

    const worker = processes[0];
    worker?.simulateMessage('not-an-object');
    worker?.simulateMessage({ type: 'unknown' });
    worker?.simulateMessage({});

    await flushMicrotasks();
    expect(events).toHaveLength(0);

    supervisor.dispose();
  });

  it('worker error é mapeado para turn.error no bus com sessionId correto', async () => {
    const { runtime, processes } = createFakeRuntime();
    const supervisor = new ProcessSupervisor(runtime);
    const bus = new SessionEventBus();
    const sessions = new SessionManager(supervisor, { eventBus: bus });

    const events: SessionBusEvent[] = [];
    bus.subscribe('sess-3', (e) => events.push(e));

    await sessions.dispatchTurn({
      sessionId: 'sess-3',
      turnId: 'turn-3',
      messages: [],
      config: { connectionSlug: 'anthropic-direct', modelId: 'claude-sonnet-4-6' },
      credentials: {},
    });

    const worker = processes[0];
    const errMsg: WorkerToMain = {
      type: 'error',
      code: 'agent.stream_error',
      message: 'boom',
      turnId: 'turn-3',
    };
    worker?.simulateMessage(errMsg);
    await flushMicrotasks();

    const turnError = events.find((e) => e.type === 'turn.error');
    expect(turnError).toBeDefined();
    if (turnError && turnError.type === 'turn.error') {
      expect(turnError.code).toBe('agent.stream_error');
      expect(turnError.sessionId).toBe('sess-3');
      expect(turnError.turnId).toBe('turn-3');
    }

    supervisor.dispose();
  });

  it('stop envia interrupt com o turnId correto', async () => {
    const { runtime, processes } = createFakeRuntime();
    const supervisor = new ProcessSupervisor(runtime);
    const bus = new SessionEventBus();
    const sessions = new SessionManager(supervisor, { eventBus: bus });

    await sessions.dispatchTurn({
      sessionId: 'sess-4',
      turnId: 'turn-4',
      messages: [],
      config: { connectionSlug: 'anthropic-direct', modelId: 'claude-sonnet-4-6' },
      credentials: {},
    });

    sessions.interrupt('sess-4', 'turn-4');
    const worker = processes[0];
    const interruptMsg = worker?.posted.find(
      (m) => typeof m === 'object' && m !== null && (m as { type?: string }).type === 'interrupt',
    );
    expect(interruptMsg).toMatchObject({ type: 'interrupt', turnId: 'turn-4' });

    supervisor.dispose();
  });
});
