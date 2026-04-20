import type { SessionId } from '@g4os/kernel';
import { describe, expect, it } from 'vitest';
import { PermissionQueue } from '../../permissions/queue.ts';
import type { PermissionRequest } from '../../permissions/types.ts';

const SESSION_ID = '00000000-0000-0000-0000-000000000001' as SessionId;

function request(id: string): PermissionRequest {
  return {
    id,
    sessionId: SESSION_ID,
    toolUseId: `tu-${id}`,
    toolName: 'Bash',
    input: {},
    requestedAt: 0,
  };
}

describe('PermissionQueue', () => {
  it('notifies listeners on enqueue and resolves on decide', async () => {
    const q = new PermissionQueue();
    const seen: string[] = [];
    q.onRequest((r) => seen.push(r.id));
    const promise = q.enqueue(request('a'));
    expect(seen).toEqual(['a']);
    expect(q.pendingCount).toBe(1);
    const decided = q.decide('a', { type: 'allow', scope: 'once' });
    expect(decided).toBe(true);
    await expect(promise).resolves.toEqual({ type: 'allow', scope: 'once' });
    expect(q.pendingCount).toBe(0);
    q.dispose();
  });

  it('decide returns false for unknown requestId', () => {
    const q = new PermissionQueue();
    expect(q.decide('missing', { type: 'allow', scope: 'once' })).toBe(false);
    q.dispose();
  });

  it('dispose auto-denies pending requests', async () => {
    const q = new PermissionQueue();
    const p = q.enqueue(request('a'));
    q.dispose();
    await expect(p).resolves.toEqual({ type: 'deny', reason: 'queue_disposed' });
  });

  it('listener disposer removes the listener', () => {
    const q = new PermissionQueue();
    const seen: string[] = [];
    const d = q.onRequest((r) => seen.push(r.id));
    d.dispose();
    void q.enqueue(request('a'));
    expect(seen).toEqual([]);
    q.dispose();
  });
});
