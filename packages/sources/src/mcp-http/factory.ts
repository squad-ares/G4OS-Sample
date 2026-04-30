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
    // AuthToken plaintext continua aceito em deserialization
    // pra suportar configs legacy em memória, mas o sources-store
    // já o remove na escrita — então em prática, configs persistidos não
    // chegam aqui com authToken. Preferir authCredentialKey.
    ...(raw.authToken === undefined ? {} : { authToken: raw.authToken }),
    ...(raw.authCredentialKey === undefined ? {} : { authCredentialKey: raw.authCredentialKey }),
    ...(raw.headers ? { headers: raw.headers } : {}),
  };
}
