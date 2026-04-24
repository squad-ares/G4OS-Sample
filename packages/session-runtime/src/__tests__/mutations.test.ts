import { randomUUID } from 'node:crypto';
import type { SessionsRepository } from '@g4os/data/sessions';
import type { Session, SessionEvent } from '@g4os/kernel/types';
import { describe, expect, it, vi } from 'vitest';
import { lifecycleMutation, simpleMutation } from '../mutations.ts';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: randomUUID(),
    workspaceId: randomUUID(),
    name: 'test',
    status: 'idle',
    lifecycle: 'active',
    enabledSourceSlugs: [],
    stickyMountedSourceSlugs: [],
    rejectedSourceSlugs: [],
    lastEventSequence: 3,
    messageCount: 0,
    lastMessageAt: null,
    unread: false,
    metadata: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as Session;
}

function makeRepo(session: Session | null): SessionsRepository {
  return { get: vi.fn().mockResolvedValue(session) } as unknown as SessionsRepository;
}

describe('simpleMutation', () => {
  it('returns ok when mutation resolves', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const r = await simpleMutation('id-1', 'test.op', run);
    expect(r.isOk()).toBe(true);
    expect(run).toHaveBeenCalled();
  });

  it('returns err when mutation throws', async () => {
    const run = vi.fn().mockRejectedValue(new Error('boom'));
    const r = await simpleMutation('id-1', 'test.op', run);
    expect(r.isErr()).toBe(true);
  });
});

describe('lifecycleMutation (FOLLOWUP-04)', () => {
  it('returns not-found when repo returns null', async () => {
    const repo = makeRepo(null);
    const mutation = vi.fn().mockResolvedValue(undefined);
    const r = await lifecycleMutation(repo, 'missing', 'test', 'session.archived', mutation);
    expect(r.isErr()).toBe(true);
    expect(mutation).not.toHaveBeenCalled();
  });

  it('without applyReducer: writes event via injected store and runs mutation', async () => {
    const session = makeSession();
    const repo = makeRepo(session);
    const append = vi.fn().mockResolvedValue(undefined);
    const mutation = vi.fn().mockResolvedValue(undefined);
    const r = await lifecycleMutation(repo, session.id, 'test', 'session.archived', mutation, {
      eventStore: { append },
    });
    expect(r.isOk()).toBe(true);
    expect(append).toHaveBeenCalledOnce();
    expect(mutation).toHaveBeenCalledOnce();
  });

  it('with applyReducer: reducer receives event carrying session.lastEventSequence + 1', async () => {
    const session = makeSession({ lastEventSequence: 11 });
    const repo = makeRepo(session);
    const mutation = vi.fn().mockResolvedValue(undefined);
    const applyReducer = vi.fn();
    const append = vi.fn().mockResolvedValue(undefined);
    const r = await lifecycleMutation(repo, session.id, 'test', 'session.archived', mutation, {
      applyReducer,
      eventStore: { append },
    });
    expect(r.isOk()).toBe(true);
    expect(applyReducer).toHaveBeenCalledOnce();
    const event = applyReducer.mock.calls[0]?.[0] as SessionEvent;
    expect(event.type).toBe('session.archived');
    expect(event.sequenceNumber).toBe(12);
    expect(append).toHaveBeenCalledOnce();
  });
});
