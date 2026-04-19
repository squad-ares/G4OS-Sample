import { describe, expect, it } from 'vitest';
import { InMemoryKeychain } from '../backends/index.ts';
import type { RotatedCredential, RotationHandler } from '../rotation/handler.ts';
import { RotationOrchestrator } from '../rotation/orchestrator.ts';
import { CredentialVault } from '../vault.ts';

class StubHandler implements RotationHandler {
  calls = 0;
  constructor(
    private readonly prefix: string,
    private readonly next: RotatedCredential,
  ) {}
  canHandle(key: string): boolean {
    return key.startsWith(this.prefix);
  }
  rotate(): Promise<RotatedCredential> {
    this.calls++;
    return Promise.resolve(this.next);
  }
}

describe('RotationOrchestrator', () => {
  it('rotates credentials inside the buffer window', async () => {
    const vault = new CredentialVault(new InMemoryKeychain());
    const expiringAt = Date.now() + 60_000;
    await vault.set('oauth.google', 'old-token', { expiresAt: expiringAt });

    const handler = new StubHandler('oauth.', {
      newValue: 'new-token',
      expiresAt: Date.now() + 3600_000,
    });

    const orchestrator = new RotationOrchestrator({
      vault,
      handlers: [handler],
      bufferMs: 5 * 60_000,
    });

    const rotated = await orchestrator.rotateIfExpiring('oauth.google');
    expect(rotated).toBe(true);
    expect(handler.calls).toBe(1);

    const read = await vault.get('oauth.google');
    expect(read.isOk() && read.value === 'new-token').toBe(true);
  });

  it('does not rotate when outside buffer window', async () => {
    const vault = new CredentialVault(new InMemoryKeychain());
    await vault.set('oauth.google', 'old', { expiresAt: Date.now() + 24 * 3600_000 });

    const handler = new StubHandler('oauth.', {
      newValue: 'new',
      expiresAt: Date.now() + 48 * 3600_000,
    });
    const orchestrator = new RotationOrchestrator({
      vault,
      handlers: [handler],
      bufferMs: 60_000,
    });

    const rotated = await orchestrator.rotateIfExpiring('oauth.google');
    expect(rotated).toBe(false);
    expect(handler.calls).toBe(0);
  });

  it('isolates failures per credential', async () => {
    const vault = new CredentialVault(new InMemoryKeychain());
    const now = Date.now();
    await vault.set('oauth.a', 'a', { expiresAt: now + 1_000 });
    await vault.set('oauth.b', 'b', { expiresAt: now + 1_000 });

    const failingHandler: RotationHandler = {
      canHandle: (k) => k === 'oauth.a',
      rotate: () => Promise.reject(new Error('boom')),
    };
    const ok = new StubHandler('oauth.b', { newValue: 'b2', expiresAt: now + 3600_000 });

    const orchestrator = new RotationOrchestrator({
      vault,
      handlers: [failingHandler, ok],
      bufferMs: 60_000,
    });

    const a = await orchestrator.rotateIfExpiring('oauth.a');
    const b = await orchestrator.rotateIfExpiring('oauth.b');

    expect(a).toBe(false);
    expect(b).toBe(true);
    const reread = await vault.get('oauth.b');
    expect(reread.isOk() && reread.value === 'b2').toBe(true);
  });

  it('start() timer is disposable and clears interval', () => {
    const vault = new CredentialVault(new InMemoryKeychain());
    const orchestrator = new RotationOrchestrator({
      vault,
      handlers: [],
      intervalMs: 60_000,
    });

    const disposable = orchestrator.start();
    expect(typeof disposable.dispose).toBe('function');
    orchestrator.dispose();
  });
});
