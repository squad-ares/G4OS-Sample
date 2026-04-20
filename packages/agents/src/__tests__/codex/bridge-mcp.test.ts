import { describe, expect, it } from 'vitest';
import { BridgeMcpConnector } from '../../codex/bridge-mcp/connect.ts';

describe('BridgeMcpConnector', () => {
  it('attach() stores handle with timestamp', () => {
    const connector = new BridgeMcpConnector();
    const handle = connector.attach('ws://localhost/mcp');
    expect(handle.url).toBe('ws://localhost/mcp');
    expect(handle.attachedAt).toBeGreaterThan(0);
    expect(connector.current()).toBe(handle);
  });

  it('attach() uses constructor default url when called with empty string', () => {
    const connector = new BridgeMcpConnector({ url: 'ws://default/mcp' });
    expect(connector.attach().url).toBe('ws://default/mcp');
  });

  it('attach() without url throws invalidInput AgentError', () => {
    const connector = new BridgeMcpConnector();
    expect(() => connector.attach('')).toThrow();
  });

  it('detach() clears the handle', () => {
    const connector = new BridgeMcpConnector({ url: 'ws://localhost/mcp' });
    connector.attach();
    connector.detach();
    expect(connector.current()).toBeUndefined();
  });
});
