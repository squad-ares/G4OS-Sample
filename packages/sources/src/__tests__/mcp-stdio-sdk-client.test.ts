import { describe, expect, it, vi } from 'vitest';
import {
  createSdkMcpClientFactory,
  type SdkBindings,
  type SdkClientLike,
} from '../mcp-stdio/sdk-client.ts';
import type { McpStdioConfig } from '../mcp-stdio/types.ts';

function makeConfig(): McpStdioConfig {
  return {
    slug: 'fake',
    // Fixture alinhada com SourceMetadata: slug + requiresAuth obrigatórios.
    metadata: { slug: 'fake', displayName: 'Fake', category: 'other', requiresAuth: false },
    command: 'node',
    args: ['server.js'],
  };
}

function makeFakeSdk(overrides: Partial<SdkClientLike> = {}): {
  bindings: SdkBindings;
  client: SdkClientLike;
  transport: unknown;
  createClientCalls: Array<{ name: string; version: string }>;
  createTransportCalls: Array<{ command: string; args?: readonly string[] }>;
} {
  const defaultClient: SdkClientLike = {
    connect: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn().mockResolvedValue({ tools: [] }),
    callTool: vi.fn().mockResolvedValue({ content: [], isError: false }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const client: SdkClientLike = { ...defaultClient, ...overrides };
  const transport = { marker: 'transport' };
  const createClientCalls: Array<{ name: string; version: string }> = [];
  const createTransportCalls: Array<{ command: string; args?: readonly string[] }> = [];
  const bindings: SdkBindings = {
    createClient: (info) => {
      createClientCalls.push(info);
      return client;
    },
    createStdioTransport: (params) => {
      createTransportCalls.push(params);
      return transport;
    },
  };
  return { bindings, client, transport, createClientCalls, createTransportCalls };
}

describe('SdkMcpClient (stdio)', () => {
  it('connect spawns transport with command/args/env and calls client.connect', async () => {
    const fake = makeFakeSdk();
    const factory = createSdkMcpClientFactory({ loadSdk: async () => fake.bindings });
    const client = factory.create({ ...makeConfig(), env: { A: '1' } });
    const result = await client.connect();
    expect(result.isOk()).toBe(true);
    expect(fake.createTransportCalls).toEqual([
      { command: 'node', args: ['server.js'], env: { A: '1' } },
    ]);
    expect(fake.client.connect).toHaveBeenCalledWith(fake.transport);
  });

  it('connect returns err(Error) when SDK load throws', async () => {
    const factory = createSdkMcpClientFactory({
      loadSdk: () => Promise.reject(new Error('sdk missing')),
    });
    const client = factory.create(makeConfig());
    const result = await client.connect();
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.message).toMatch(/sdk missing/);
  });

  it('connect returns err(Error) when client.connect rejects', async () => {
    const fake = makeFakeSdk({
      connect: vi.fn().mockRejectedValue(new Error('spawn failed')),
    });
    const factory = createSdkMcpClientFactory({ loadSdk: async () => fake.bindings });
    const client = factory.create(makeConfig());
    const result = await client.connect();
    expect(result.isErr()).toBe(true);
  });

  it('listTools maps SDK tool payloads to ToolDefinition[]', async () => {
    const fake = makeFakeSdk({
      listTools: vi.fn().mockResolvedValue({
        tools: [
          { name: 'search', description: 'do search', inputSchema: { type: 'object' } },
          { name: 'no-desc', inputSchema: { type: 'object' } },
        ],
      }),
    });
    const factory = createSdkMcpClientFactory({ loadSdk: async () => fake.bindings });
    const client = factory.create(makeConfig());
    await client.connect();
    const tools = await client.listTools();
    expect(tools).toEqual([
      { name: 'search', description: 'do search', inputSchema: { type: 'object' } },
      { name: 'no-desc', description: '', inputSchema: { type: 'object' } },
    ]);
  });

  it('listTools returns [] when not connected', async () => {
    const fake = makeFakeSdk();
    const factory = createSdkMcpClientFactory({ loadSdk: async () => fake.bindings });
    const client = factory.create(makeConfig());
    await expect(client.listTools()).resolves.toEqual([]);
  });

  it('callTool emits a single ToolResult then completes', async () => {
    const fake = makeFakeSdk({
      callTool: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: 'ok' }],
        isError: false,
      }),
    });
    const factory = createSdkMcpClientFactory({ loadSdk: async () => fake.bindings });
    const client = factory.create(makeConfig());
    await client.connect();

    const emitted: Array<{ isError: boolean; content: unknown }> = [];
    await new Promise<void>((resolve, reject) => {
      client.callTool('search', { q: 'g4' }).subscribe({
        next: (v) => emitted.push(v),
        error: reject,
        complete: resolve,
      });
    });
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.isError).toBe(false);
    expect(fake.client.callTool).toHaveBeenCalledWith({
      name: 'search',
      arguments: { q: 'g4' },
    });
  });

  it('callTool propagates SDK errors via Observable.error', async () => {
    const fake = makeFakeSdk({
      callTool: vi.fn().mockRejectedValue(new Error('tool crashed')),
    });
    const factory = createSdkMcpClientFactory({ loadSdk: async () => fake.bindings });
    const client = factory.create(makeConfig());
    await client.connect();

    await expect(
      new Promise((_resolve, reject) => {
        client.callTool('x', {}).subscribe({
          next: () => {
            // ignore emissions — we only care about the error path
          },
          error: reject,
          complete: () => reject(new Error('unexpected complete')),
        });
      }),
    ).rejects.toThrow(/tool crashed/);
  });

  it('callTool errors when not connected', async () => {
    const fake = makeFakeSdk();
    const factory = createSdkMcpClientFactory({ loadSdk: async () => fake.bindings });
    const client = factory.create(makeConfig());
    await expect(
      new Promise((_resolve, reject) => {
        client.callTool('x', {}).subscribe({
          next: () => {
            // ignore emissions — not expected in the not-connected path
          },
          error: reject,
          complete: () => reject(new Error('should have errored')),
        });
      }),
    ).rejects.toThrow(/not connected/);
  });

  it('close invokes client.close and becomes a no-op afterwards', async () => {
    const fake = makeFakeSdk();
    const factory = createSdkMcpClientFactory({ loadSdk: async () => fake.bindings });
    const client = factory.create(makeConfig());
    await client.connect();
    await client.close();
    await client.close(); // second call should be a no-op
    expect(fake.client.close).toHaveBeenCalledTimes(1);
  });
});
