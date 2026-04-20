import type { ISource, SourceConfig, SourceFactory } from '../interface/source.ts';
import { McpStdioSource } from './source.ts';
import type { McpClientFactory, McpStdioConfig } from './types.ts';

export interface McpStdioFactoryOptions {
  readonly clientFactory: McpClientFactory;
  readonly platform?: NodeJS.Platform;
}

export function createMcpStdioFactory(options: McpStdioFactoryOptions): SourceFactory {
  return {
    kind: 'mcp-stdio',
    supports: (config: SourceConfig) => config.kind === 'mcp-stdio',
    create: (config: SourceConfig): ISource => {
      const stdioConfig = toMcpStdioConfig(config);
      return new McpStdioSource(stdioConfig, options.clientFactory, options.platform);
    },
  };
}

function toMcpStdioConfig(config: SourceConfig): McpStdioConfig {
  const raw = config.config as Partial<McpStdioConfig>;
  if (typeof raw.command !== 'string') {
    throw new Error(`mcp-stdio source ${config.slug}: missing command`);
  }
  if (!Array.isArray(raw.args)) {
    throw new Error(`mcp-stdio source ${config.slug}: missing args`);
  }
  if (!raw.metadata) {
    throw new Error(`mcp-stdio source ${config.slug}: missing metadata`);
  }
  return {
    slug: config.slug,
    metadata: raw.metadata,
    command: raw.command,
    args: raw.args,
    ...(raw.env ? { env: raw.env } : {}),
    ...(raw.executionMode ? { executionMode: raw.executionMode } : {}),
    ...(raw.needsBrowserAuth === undefined ? {} : { needsBrowserAuth: raw.needsBrowserAuth }),
    ...(raw.memoryLimitMb === undefined ? {} : { memoryLimitMb: raw.memoryLimitMb }),
    ...(raw.maxRestarts === undefined ? {} : { maxRestarts: raw.maxRestarts }),
  };
}
