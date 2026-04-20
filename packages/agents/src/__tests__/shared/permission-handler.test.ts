import { describe, expect, it } from 'vitest';
import {
  AlwaysAllowHandler,
  AlwaysDenyHandler,
  AskHandler,
} from '../../shared/broker/permission-handler.ts';

describe('AlwaysAllowHandler', () => {
  it('allows every tool without approval', () => {
    const h = new AlwaysAllowHandler();
    expect(h.evaluate()).toEqual({ allowed: true, requiresUserApproval: false });
  });
});

describe('AlwaysDenyHandler', () => {
  it('denies every tool', () => {
    const h = new AlwaysDenyHandler();
    const d = h.evaluate();
    expect(d.allowed).toBe(false);
    expect(d.description).toBe('denied by policy');
  });
});

describe('AskHandler', () => {
  const hooks = {
    isWhitelisted: (t: string) => t === 'preload_whitelisted',
    isDomainWhitelisted: (d: string) => d === 'preload.example.com',
    needsApproval: (_: string, input: Readonly<Record<string, unknown>>) =>
      input.sensitive === true,
  };

  it('short-circuits approval when preload-whitelisted', () => {
    const h = new AskHandler(hooks);
    const d = h.evaluate('preload_whitelisted', {});
    expect(d).toEqual({ allowed: true, requiresUserApproval: false });
  });

  it('short-circuits approval when runtime-whitelisted', () => {
    const h = new AskHandler(hooks);
    h.whitelist('runtime_tool');
    expect(h.evaluate('runtime_tool', { sensitive: true })).toEqual({
      allowed: true,
      requiresUserApproval: false,
    });
  });

  it('delegates to needsApproval hook otherwise', () => {
    const h = new AskHandler(hooks);
    expect(h.evaluate('some_tool', { sensitive: true }).requiresUserApproval).toBe(true);
    expect(h.evaluate('some_tool', {}).requiresUserApproval).toBe(false);
  });

  it('tracks domain whitelist additions', () => {
    const h = new AskHandler(hooks);
    h.whitelistDomain('runtime.example.com');
    expect(h.hasDomain('runtime.example.com')).toBe(true);
    expect(h.hasDomain('preload.example.com')).toBe(true);
    expect(h.hasDomain('other.example.com')).toBe(false);
  });
});
