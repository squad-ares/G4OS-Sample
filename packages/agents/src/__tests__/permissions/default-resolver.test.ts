import type { SessionId } from '@g4os/kernel';
import { describe, expect, it, vi } from 'vitest';
import { DefaultPermissionResolver } from '../../permissions/default-resolver.ts';
import type {
  PermissionDecision,
  PermissionRememberStore,
  PermissionRequest,
  PermissionUI,
} from '../../permissions/types.ts';

const SESSION_ID = '00000000-0000-0000-0000-000000000001' as SessionId;

function makeRequest(toolName: string): PermissionRequest {
  return {
    id: `req-${toolName}`,
    sessionId: SESSION_ID,
    toolUseId: `tu-${toolName}`,
    toolName,
    input: {},
    requestedAt: 0,
  };
}

function makeStore(initial: PermissionDecision | null = null): PermissionRememberStore {
  let stored = initial;
  return {
    get: vi.fn(async () => stored),
    set: vi.fn((_sid, _name, decision) => {
      stored = decision;
      return Promise.resolve();
    }),
  };
}

function makeUI(decision: PermissionDecision): PermissionUI {
  return { askPermission: vi.fn(async () => decision) };
}

describe('DefaultPermissionResolver', () => {
  it('returns remembered decision without asking UI', async () => {
    const remembered: PermissionDecision = { type: 'allow', scope: 'always' };
    const ui = makeUI({ type: 'deny' });
    const store = makeStore(remembered);
    const r = new DefaultPermissionResolver(ui, store);
    const decision = await r.resolve(makeRequest('Bash'), 'ask');
    expect(decision).toEqual(remembered);
    expect(ui.askPermission).not.toHaveBeenCalled();
  });

  it('allow-all mode grants without asking UI', async () => {
    const ui = makeUI({ type: 'deny' });
    const r = new DefaultPermissionResolver(ui, makeStore());
    const decision = await r.resolve(makeRequest('Bash'), 'allow-all');
    expect(decision).toEqual({ type: 'allow', scope: 'once' });
    expect(ui.askPermission).not.toHaveBeenCalled();
  });

  it('safe mode denies forbidden tools without asking UI', async () => {
    const ui = makeUI({ type: 'allow', scope: 'once' });
    const r = new DefaultPermissionResolver(ui, makeStore());
    const decision = await r.resolve(makeRequest('Bash'), 'safe');
    expect(decision.type).toBe('deny');
    expect(ui.askPermission).not.toHaveBeenCalled();
  });

  it('safe mode allows whitelisted read-only tools', async () => {
    const ui = makeUI({ type: 'deny' });
    const r = new DefaultPermissionResolver(ui, makeStore());
    const decision = await r.resolve(makeRequest('Grep'), 'safe');
    expect(decision).toEqual({ type: 'allow', scope: 'once' });
    expect(ui.askPermission).not.toHaveBeenCalled();
  });

  it('safe mode asks UI for unknown tools', async () => {
    const ui = makeUI({ type: 'allow', scope: 'once' });
    const r = new DefaultPermissionResolver(ui, makeStore());
    const decision = await r.resolve(makeRequest('unknown_tool'), 'safe');
    expect(decision).toEqual({ type: 'allow', scope: 'once' });
    expect(ui.askPermission).toHaveBeenCalledOnce();
  });

  it('persists decisions with scope > once', async () => {
    const ui = makeUI({ type: 'allow', scope: 'session' });
    const store = makeStore();
    const r = new DefaultPermissionResolver(ui, store);
    await r.resolve(makeRequest('Bash'), 'ask');
    expect(store.set).toHaveBeenCalledOnce();
  });

  it('does not persist once-scoped decisions', async () => {
    const ui = makeUI({ type: 'allow', scope: 'once' });
    const store = makeStore();
    const r = new DefaultPermissionResolver(ui, store);
    await r.resolve(makeRequest('Bash'), 'ask');
    expect(store.set).not.toHaveBeenCalled();
  });

  it('does not persist deny decisions', async () => {
    const ui = makeUI({ type: 'deny' });
    const store = makeStore();
    const r = new DefaultPermissionResolver(ui, store);
    const decision = await r.resolve(makeRequest('Bash'), 'ask');
    expect(decision.type).toBe('deny');
    expect(store.set).not.toHaveBeenCalled();
  });
});
