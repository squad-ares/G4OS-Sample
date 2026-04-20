import type { ISource, SourceConfig, SourceFactory } from '../interface/source.ts';
import { McpHttpSource } from './source.ts';
import type { McpHttpClientFactory, McpHttpConfig } from './types.ts';

export interface McpHttpFactoryOptions {
  readonly clientFactory: McpHttpClientFactory;
}

export function createMcpHttpFactory(options: McpHttpFactoryOptions): SourceFactory {
  return {
    kind: 'mcp-http',
    supports: (config: SourceConfig) => config.kind === 'mcp-http',
    create: (config: SourceConfig): ISource => {
      const httpConfig = toMcpHttpConfig(config);
      return new McpHttpSource(httpConfig, options.clientFactory);
    },
  };
}

function toMcpHttpConfig(config: SourceConfig): McpHttpConfig {
  const raw = config.config as Partial<McpHttpConfig>;
  if (typeof raw.url !== 'string') {
    throw new Error(`mcp-http source ${config.slug}: missing url`);
  }
  if (!raw.metadata) {
    throw new Error(`mcp-http source ${config.slug}: missing metadata`);
  }
  return {
    slug: config.slug,
    metadata: raw.metadata,
    url: raw.url,
    ...(raw.authToken === undefined ? {} : { authToken: raw.authToken }),
    ...(raw.headers ? { headers: raw.headers } : {}),
  };
}
