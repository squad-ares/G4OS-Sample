import { err, ok, type Result } from 'neverthrow';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import type { ToolDefinition, ToolResult } from '../interface/source.ts';
import { McpStdioSource } from '../mcp-stdio/source.ts';
import type { McpClient, McpClientFactory, McpStdioConfig } from '../mcp-stdio/types.ts';

function makeClient(options: {
  connectResult: Result<void, Error>;
  tools?: readonly ToolDefinition[];
}): McpClient {
  let closed = false;
  return {
    connect() {
      return Promise.resolve(options.connectResult);
    },
    listTools() {
      return Promise.resolve(options.tools ?? []);
    },
    callTool(_name, _input, _signal) {
      return of({ content: 'ok', isError: false } satisfies ToolResult);
    },
    close() {
      closed = true;
      return Promise.resolve();
    },
    get closed() {
      return closed;
    },
  } as McpClient;
}

function makeFactory(client: McpClient): McpClientFactory {
  return { create: () => client };
}

const config: McpStdioConfig = {
  slug: 'test-mcp',
  metadata: {
    slug: 'test-mcp',
    displayName: 'Test MCP',
    category: 'dev',
    requiresAuth: false,
  },
  command: 'node',
  args: ['server.js'],
};

describe('McpStdioSource', () => {
  it('activates successfully and exposes connected status', async () => {
    const client = makeClient({
      connectResult: ok(undefined),
      tools: [{ name: 't', description: '', inputSchema: {} }],
    });
    const src = new McpStdioSource(config, makeFactory(client), 'darwin');

    const result = await src.activate();
    expect(result.isOk()).toBe(true);
    expect(src.runtimeMode).toBe('protected');

    const tools = await src.listTools();
    expect(tools._unsafeUnwrap()).toHaveLength(1);

    await src.deactivate();
    src.dispose();
  });

  it('returns auth_required when connect throws unauthorized', async () => {
    const client = makeClient({ connectResult: err(new Error('401 Unauthorized')) });
    const src = new McpStdioSource(config, makeFactory(client), 'darwin');

    const result = await src.activate();
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('source.auth_required');
    src.dispose();
  });

  it('resolves compat on Windows', async () => {
    const client = makeClient({ connectResult: ok(undefined) });
    const src = new McpStdioSource(config, makeFactory(client), 'win32');
    await src.activate();
    expect(src.runtimeMode).toBe('compat');
    src.dispose();
  });
});
