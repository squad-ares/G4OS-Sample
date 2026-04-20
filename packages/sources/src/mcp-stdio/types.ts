import type { Result } from 'neverthrow';
import type { Observable } from 'rxjs';
import type { SourceMetadata, ToolDefinition, ToolResult } from '../interface/source.ts';
import type { McpExecutionMode } from './runtime-mode.ts';

export interface McpStdioConfig {
  readonly slug: string;
  readonly metadata: SourceMetadata;
  readonly command: string;
  readonly args: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly executionMode?: McpExecutionMode;
  readonly needsBrowserAuth?: boolean;
  readonly memoryLimitMb?: number;
  readonly maxRestarts?: number;
}

/**
 * Abstract MCP client surface. Implementations wrap
 * `@modelcontextprotocol/sdk` (lazily imported) or test doubles.
 */
export interface McpClient {
  connect(): Promise<Result<void, Error>>;
  listTools(): Promise<readonly ToolDefinition[]>;
  callTool(name: string, input: unknown, signal?: AbortSignal): Observable<ToolResult>;
  close(): Promise<void>;
}

export interface McpClientFactory {
  create(config: McpStdioConfig): McpClient;
}
