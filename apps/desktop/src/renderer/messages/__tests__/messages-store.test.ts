import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  invalidateMessages,
  messagesListKey,
  messagesListQueryOptions,
} from '../messages-store.ts';

vi.mock('../../ipc/trpc-client.ts', () => ({
  trpc: { messages: { list: { query: vi.fn().mockResolvedValue([]) } } },
}));

const SESSION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('messagesListKey', () => {
  it('returns stable tuple key', () => {
    expect(messagesListKey(SESSION_ID)).toEqual(['messages', 'list', SESSION_ID]);
  });
});

describe('messagesListQueryOptions', () => {
  it('returns correct queryKey', () => {
    const opts = messagesListQueryOptions(SESSION_ID);
    expect(opts.queryKey).toEqual(['messages', 'list', SESSION_ID]);
  });

  it('sets staleTime and gcTime', () => {
    const opts = messagesListQueryOptions(SESSION_ID);
    expect(opts.staleTime).toBe(10_000);
    expect(opts.gcTime).toBe(5 * 60_000);
  });

  it('queryFn calls trpc.messages.list with sessionId', async () => {
    const { trpc } = await import('../../ipc/trpc-client.ts');
    const opts = messagesListQueryOptions(SESSION_ID);
    await opts.queryFn();
    expect(trpc.messages.list.query).toHaveBeenCalledWith({ sessionId: SESSION_ID });
  });
});

describe('invalidateMessages', () => {
  it('invalidates queries with the messages list key', async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    await invalidateMessages(qc, SESSION_ID);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['messages', 'list', SESSION_ID] });
  });
});
