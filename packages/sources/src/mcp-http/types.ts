import type { Result } from 'neverthrow';
import type { Observable } from 'rxjs';
import type { SourceMetadata, ToolDefinition, ToolResult } from '../interface/source.ts';

export interface McpHttpConfig {
  readonly slug: string;
  readonly metadata: SourceMetadata;
  readonly url: string;
  /** @deprecated Token plaintext em config contradiz vault gateway único. Usar `authCredentialKey`. */
  readonly authToken?: string;
  /** Chave no `CredentialVault` cujo valor é usado como Bearer token. Resolvido em runtime por `authResolver`. */
  readonly authCredentialKey?: string;
  readonly headers?: Readonly<Record<string, string>>;
}

export interface McpHttpClient {
  connect(): Promise<Result<void, Error>>;
  listTools(): Promise<readonly ToolDefinition[]>;
  callTool(name: string, input: unknown, signal?: AbortSignal): Observable<ToolResult>;
  close(): Promise<void>;
  readonly onClose: (cb: () => void) => void;
  readonly onError: (cb: (e: Error) => void) => void;
}

export interface McpHttpClientFactory {
  create(config: McpHttpConfig): McpHttpClient;
}
