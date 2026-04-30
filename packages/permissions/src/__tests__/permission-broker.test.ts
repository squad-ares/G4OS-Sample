import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PermissionBroker, type PermissionRequest } from '../permission-broker.ts';
import type { PermissionStore } from '../permission-store.ts';

function firstRequestId(emitted: readonly PermissionRequest[]): string {
  const [req] = emitted;
  if (!req) throw new Error('expected a pending permission request');
  return req.requestId;
}

function makeInput(overrides: Partial<Parameters<PermissionBroker['request']>[0]> = {}) {
  return {
    sessionId: 'sess-1',
    turnId: 'turn-1',
    toolUseId: 'tu-1',
    toolName: 'read_file',
    input: { path: '/tmp/x' },
    workspaceId: 'ws-1',
    ...overrides,
  };
}

function makeStore(override: Partial<PermissionStore> = {}): PermissionStore {
  const base: Partial<PermissionStore> = {
    find: vi.fn().mockResolvedValue(null),
    persist: vi.fn().mockResolvedValue({
      toolName: 'read_file',
      argsHash: 'hash',
      argsPreview: '{}',
      decidedAt: Date.now(),
    }),
  };
  return { ...(base as PermissionStore), ...override } as PermissionStore;
}

describe('PermissionBroker', () => {
  let broker: PermissionBroker;
  let emitted: PermissionRequest[];

  beforeEach(() => {
    emitted = [];
  });

  afterEach(() => {
    broker?.dispose();
  });

  it('emits onRequest and resolves with the user decision', async () => {
    broker = new PermissionBroker((req) => emitted.push(req));
    const pending = broker.request(makeInput());
    expect(emitted).toHaveLength(1);
    expect(broker.pendingCount).toBe(1);

    const accepted = await broker.respond(firstRequestId(emitted), 'allow_once');
    expect(accepted).toBe(true);
    await expect(pending).resolves.toBe('allow_once');
    expect(broker.pendingCount).toBe(0);
  });

  it('caches allow_session for subsequent matching calls on the same session', async () => {
    broker = new PermissionBroker((req) => emitted.push(req));
    const first = broker.request(makeInput());
    broker.respond(firstRequestId(emitted), 'allow_session');
    await first;

    // Same (sessionId, toolName, argsHash) — should not emit again
    const cached = await broker.request(makeInput());
    expect(cached).toBe('allow_once');
    expect(emitted).toHaveLength(1);
  });

  it('does NOT cache allow_session across different sessions', async () => {
    broker = new PermissionBroker((req) => emitted.push(req));
    const first = broker.request(makeInput({ sessionId: 'sess-1' }));
    broker.respond(firstRequestId(emitted), 'allow_session');
    await first;

    // Different sessionId → ask again. Swallow the pending rejection
    // since afterEach disposes the broker.
    broker.request(makeInput({ sessionId: 'sess-2' })).catch(() => {
      // dispose during afterEach rejects this — intentionally ignored.
    });
    expect(emitted).toHaveLength(2);
  });

  it('auto-resolves via store when allow_always was persisted before', async () => {
    const store = makeStore({
      find: vi.fn().mockResolvedValue({
        toolName: 'read_file',
        argsHash: 'prev',
        argsPreview: '{}',
        decidedAt: 1,
      }),
    });
    broker = new PermissionBroker((req) => emitted.push(req), { store });
    const result = await broker.request(makeInput());
    expect(result).toBe('allow_once');
    expect(emitted).toHaveLength(0);
  });

  it('persists allow_always to the store when user chooses it', async () => {
    const persist = vi.fn().mockResolvedValue({
      toolName: 'read_file',
      argsHash: 'h',
      argsPreview: '{}',
      decidedAt: 1,
    });
    const store = makeStore({ persist });
    broker = new PermissionBroker((req) => emitted.push(req), { store });

    const pending = broker.request(makeInput());
    // Store lookup is async → onRequest fires on next microtask.
    await new Promise((r) => setImmediate(r));
    broker.respond(firstRequestId(emitted), 'allow_always');
    await expect(pending).resolves.toBe('allow_always');
    await new Promise((r) => setImmediate(r));
    expect(persist).toHaveBeenCalledWith('ws-1', {
      toolName: 'read_file',
      args: { path: '/tmp/x' },
    });
  });

  it('cancel(sessionId) rejects pending requests and clears allow_session cache', async () => {
    broker = new PermissionBroker((req) => emitted.push(req));
    const pending = broker.request(makeInput({ sessionId: 'sess-X' }));
    expect(broker.pendingCount).toBe(1);
    broker.cancel('sess-X');
    await expect(pending).rejects.toThrow(/cancelled/);
    expect(broker.pendingCount).toBe(0);
  });

  it('respond returns false for unknown requestId', async () => {
    broker = new PermissionBroker(() => {
      // no-op emitter — this test never emits
    });
    await expect(broker.respond('nope', 'allow_once')).resolves.toBe(false);
  });

  it('dispose rejects all pending requests', async () => {
    broker = new PermissionBroker((req) => emitted.push(req));
    const p = broker.request(makeInput());
    broker.dispose();
    await expect(p).rejects.toThrow(/disposed/);
  });

  it('coalesces concurrent identical requests into a single onRequest emission', async () => {
    broker = new PermissionBroker((req) => emitted.push(req));
    const p1 = broker.request(makeInput());
    const p2 = broker.request(makeInput()); // same (sessionId, toolName, argsHash)
    expect(emitted).toHaveLength(1);
    expect(broker.pendingCount).toBe(1);

    broker.respond(firstRequestId(emitted), 'allow_once');
    await expect(p1).resolves.toBe('allow_once');
    await expect(p2).resolves.toBe('allow_once');
  });

  it('does NOT coalesce when args differ (different argsHash)', async () => {
    broker = new PermissionBroker((req) => emitted.push(req));
    const p1 = broker.request(makeInput({ input: { path: '/a' } }));
    const p2 = broker.request(makeInput({ input: { path: '/b' } }));
    expect(emitted).toHaveLength(2);

    const [req0, req1] = emitted;
    if (!req0 || !req1) throw new Error('expected 2 pending permission requests');
    broker.respond(req0.requestId, 'allow_once');
    broker.respond(req1.requestId, 'deny');
    await expect(p1).resolves.toBe('allow_once');
    await expect(p2).resolves.toBe('deny');
  });

  it('coalesce slot is freed after settlement so next call asks again', async () => {
    broker = new PermissionBroker((req) => emitted.push(req));
    const p1 = broker.request(makeInput());
    broker.respond(firstRequestId(emitted), 'deny');
    await expect(p1).resolves.toBe('deny');

    // Now a new identical request should emit again (coalesce slot was cleared).
    const p2 = broker.request(makeInput()).catch(() => undefined);
    expect(emitted).toHaveLength(2);
    broker.cancel('sess-1');
    await p2;
  });
});
