import type { ISource, SourceConfig, SourceFactory } from '../interface/source.ts';
import { McpHttpSource } from './source.ts';
import type { McpHttpAuthResolver, McpHttpClientFactory, McpHttpConfig } from './types.ts';

export interface McpHttpFactoryOptions {
  readonly clientFactory: McpHttpClientFactory;
  /**
   * CR-18 F-S1: resolve `authCredentialKey` em runtime via `CredentialVault`.
   * Sem isso, o campo era armazenado mas nunca virava header
   * `Authorization: Bearer <token>`, e usuários cadastrando MCP HTTP com
   * `authCredentialKey` ficavam unauthenticated (chamada → `needs_auth`).
   * Caller (composition root) injeta uma função que faz `vault.get(key)`
   * e devolve o valor ou null. Opcional — sem ele, comportamento legacy
   * (no auth resolution) é mantido para configs legacy sem chave.
   */
  readonly authResolver?: McpHttpAuthResolver;
}

export function createMcpHttpFactory(options: McpHttpFactoryOptions): SourceFactory {
  return {
    kind: 'mcp-http',
    supports: (config: SourceConfig) => config.kind === 'mcp-http',
    create: (config: SourceConfig): ISource => {
      const httpConfig = toMcpHttpConfig(config);
      return new McpHttpSource(httpConfig, options.clientFactory, options.authResolver);
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
