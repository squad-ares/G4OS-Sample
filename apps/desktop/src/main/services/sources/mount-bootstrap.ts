/**
 * Bootstrap do `McpMountRegistry` + factories stdio (SDK-backed).
 *
 * Hoje monta só `mcp-stdio` via `@modelcontextprotocol/sdk` (lazy import).
 * Managed connectors OAuth live mount vêm em MVP Step 2.
 */

import { McpMountRegistry } from '@g4os/sources/broker';
import { createMcpStdioFactory, createSdkMcpClientFactory } from '@g4os/sources/mcp-stdio';

export function createMountRegistry(): McpMountRegistry {
  return new McpMountRegistry({
    factories: [createMcpStdioFactory({ clientFactory: createSdkMcpClientFactory() })],
  });
}
