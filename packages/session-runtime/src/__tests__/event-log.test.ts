import type { SessionEvent } from '@g4os/kernel/types';
import { describe, expect, it, vi } from 'vitest';
import { appendLifecycleEvent, buildLifecycleEvent, emitLifecycleEvent } from '../event-log.ts';

const WORKSPACE_ID = '00000000-0000-0000-0000-0000000000ws';
const SESSION_ID = '00000000-0000-0000-0000-00000000sess';

describe('buildLifecycleEvent', () => {
  it('builds session.archived with base fields', () => {
    const e = buildLifecycleEvent(SESSION_ID, 'session.archived', 5);
    expect(e.type).toBe('session.archived');
    expect(e.sequenceNumber).toBe(5);
    expect(e.sessionId).toBe(SESSION_ID);
    expect(typeof e.eventId).toBe('string');
    expect(e.timestamp).toBeGreaterThan(0);
  });

  it('builds session.deleted', () => {
    const e = buildLifecycleEvent(SESSION_ID, 'session.deleted', 3);
    expect(e.type).toBe('session.deleted');
  });

  it('builds session.renamed with newName from extra', () => {
    const e = buildLifecycleEvent(SESSION_ID, 'session.renamed', 1, {
      newName: 'alpha',
    } as Partial<SessionEvent>);
    expect(e.type).toBe('session.renamed');
    if (e.type === 'session.renamed') expect(e.newName).toBe('alpha');
  });

  it('builds session.flagged with optional reason', () => {
    const e = buildLifecycleEvent(SESSION_ID, 'session.flagged', 2, {
      reason: 'restored',
    } as Partial<SessionEvent>);
    expect(e.type).toBe('session.flagged');
    if (e.type === 'session.flagged') expect(e.reason).toBe('restored');
  });
});

describe('appendLifecycleEvent (injectable event store)', () => {
  it('writes event to injected store and returns it', async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const result = await appendLifecycleEvent(
      WORKSPACE_ID,
      SESSION_ID,
      'session.archived',
      7,
      {},
      { append },
    );
    expect(result?.sequenceNumber).toBe(7);
    expect(append).toHaveBeenCalledOnce();
    const [calledSessionId, calledEvent] = append.mock.calls[0] ?? [];
    expect(calledSessionId).toBe(SESSION_ID);
    expect((calledEvent as SessionEvent).type).toBe('session.archived');
  });

  it('swallows store errors and returns null', async () => {
    const append = vi.fn().mockRejectedValue(new Error('disk full'));
    const result = await appendLifecycleEvent(
      WORKSPACE_ID,
      SESSION_ID,
      'session.archived',
      9,
      {},
      { append },
    );
    expect(result).toBeNull();
  });
});

describe('emitLifecycleEvent (FOLLOWUP-04)', () => {
  it('computes nextSequence = currentSequence + 1 and invokes applyReducer', async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const applyReducer = vi.fn();
    const event = await emitLifecycleEvent(
      {
        workspaceId: WORKSPACE_ID,
        currentSequence: 4,
        applyReducer,
        eventStore: { append },
      },
      SESSION_ID,
      'session.archived',
    );
    expect(event?.sequenceNumber).toBe(5);
    expect(applyReducer).toHaveBeenCalledOnce();
    expect(applyReducer.mock.calls[0]?.[0]?.sequenceNumber).toBe(5);
  });

  it('does not call applyReducer when append failed', async () => {
    const append = vi.fn().mockRejectedValue(new Error('fs busy'));
    const applyReducer = vi.fn();
    const event = await emitLifecycleEvent(
      {
        workspaceId: WORKSPACE_ID,
        currentSequence: 4,
        applyReducer,
        eventStore: { append },
      },
      SESSION_ID,
      'session.archived',
    );
    expect(event).toBeNull();
    expect(applyReducer).not.toHaveBeenCalled();
  });

  it('still returns event even if reducer throws (JSONL já persistido)', async () => {
    const append = vi.fn().mockResolvedValue(undefined);
    const applyReducer = vi.fn().mockImplementation(() => {
      throw new Error('projection conflict');
    });
    const event = await emitLifecycleEvent(
      {
        workspaceId: WORKSPACE_ID,
        currentSequence: 10,
        applyReducer,
        eventStore: { append },
      },
      SESSION_ID,
      'session.deleted',
    );
    expect(event?.type).toBe('session.deleted');
    expect(event?.sequenceNumber).toBe(11);
  });
});
