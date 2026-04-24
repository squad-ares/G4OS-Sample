import { describe, expect, it } from 'vitest';
import { createFakeRuntime } from '../../__tests__/fake-runtime.ts';
import { ProcessSupervisor } from '../supervisor.ts';

async function flushMicrotasks(iterations = 10): Promise<void> {
  for (let i = 0; i < iterations; i++) await Promise.resolve();
}

async function wait(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

describe('ProcessSupervisor — chaos (crash + restart + max)', () => {
  it('restart exponencial após crash em on-crash policy', async () => {
    const { runtime, processes } = createFakeRuntime();
    const supervisor = new ProcessSupervisor(runtime);

    await supervisor.spawn({
      kind: 'session',
      modulePath: '/fake/worker.cjs',
      args: ['sess-chaos-1'],
      metadata: { sessionId: 'sess-chaos-1' },
      restartPolicy: 'on-crash',
      maxRestarts: 2,
      restartBackoffMs: 10,
      healthCheckIntervalMs: 60_000,
    });

    expect(processes).toHaveLength(1);

    // Crash 1: exit com código != 0 deve disparar restart
    processes[0]?.simulateExit(1);
    await wait(30);
    await flushMicrotasks();

    expect(processes.length).toBeGreaterThanOrEqual(2);
    const secondArgs = processes[1]?.args;
    expect(secondArgs).toEqual(['sess-chaos-1']);

    supervisor.dispose();
  });

  it('exit code 0 (graceful) não dispara restart em on-crash policy', async () => {
    const { runtime, processes } = createFakeRuntime();
    const supervisor = new ProcessSupervisor(runtime);

    await supervisor.spawn({
      kind: 'session',
      modulePath: '/fake/worker.cjs',
      args: ['sess-chaos-2'],
      metadata: { sessionId: 'sess-chaos-2' },
      restartPolicy: 'on-crash',
      maxRestarts: 2,
      restartBackoffMs: 10,
      healthCheckIntervalMs: 60_000,
    });

    processes[0]?.simulateExit(0);
    await wait(30);
    await flushMicrotasks();

    expect(processes).toHaveLength(1);
    supervisor.dispose();
  });

  it('respeita maxRestarts — para de tentar após limite', async () => {
    const { runtime, processes } = createFakeRuntime();
    const supervisor = new ProcessSupervisor(runtime);

    await supervisor.spawn({
      kind: 'session',
      modulePath: '/fake/worker.cjs',
      args: ['sess-chaos-3'],
      metadata: { sessionId: 'sess-chaos-3' },
      restartPolicy: 'on-crash',
      maxRestarts: 1,
      restartBackoffMs: 5,
      healthCheckIntervalMs: 60_000,
    });

    processes[0]?.simulateExit(1);
    await wait(20);
    await flushMicrotasks();

    // Restart 1: ok (dentro do limite)
    expect(processes.length).toBe(2);

    processes[1]?.simulateExit(1);
    await wait(20);
    await flushMicrotasks();

    // Restart 2: bloqueado (maxRestarts = 1)
    expect(processes.length).toBe(2);
    supervisor.dispose();
  });

  it('shutdownAll envia shutdown e força kill em stuck', async () => {
    // autoExitOnShutdown: false → simula worker não-cooperativo
    const { runtime, processes } = createFakeRuntime({ autoExitOnShutdown: false });
    const supervisor = new ProcessSupervisor(runtime);

    await supervisor.spawn({
      kind: 'session',
      modulePath: '/fake/worker.cjs',
      args: ['sess-chaos-4'],
      metadata: { sessionId: 'sess-chaos-4' },
      restartPolicy: 'never',
      healthCheckIntervalMs: 60_000,
    });

    const worker = processes[0];
    expect(worker).toBeDefined();
    if (!worker) return;

    const shutdownPromise = supervisor.shutdownAll(100);

    const shutdownSent = worker.posted.some(
      (m) => typeof m === 'object' && m !== null && (m as { type?: string }).type === 'shutdown',
    );
    expect(shutdownSent).toBe(true);

    // Worker não responde ao shutdown (stuck) — supervisor deve force-kill após timeout
    await shutdownPromise;

    expect(worker.killCalls).toBeGreaterThan(0);
  });
});
