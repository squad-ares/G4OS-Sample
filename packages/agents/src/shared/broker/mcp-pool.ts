import type { AgentError } from '@g4os/kernel/errors';
import type { Result } from 'neverthrow';

export type McpTransport = 'stdio' | 'http';

export interface McpClientConfig {
  readonly transport: McpTransport;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: string;
  readonly url?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface McpTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: Readonly<Record<string, unknown>>;
}

export interface McpToolResult {
  readonly content: ReadonlyArray<{ readonly type: string; readonly text?: string }>;
  readonly isError: boolean;
}

export interface McpPoolClient {
  listTools(
    serverName: string,
    config: McpClientConfig,
  ): Promise<Result<readonly McpTool[], AgentError>>;

  callTool(
    serverName: string,
    config: McpClientConfig,
    toolName: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<Result<McpToolResult, AgentError>>;

  closeAll(): Promise<void>;
}
