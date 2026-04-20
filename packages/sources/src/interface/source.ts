import type { IDisposable } from '@g4os/kernel/disposable';
import type { SourceError } from '@g4os/kernel/errors';
import type { Result } from 'neverthrow';
import type { Observable } from 'rxjs';

export type SourceKind = 'mcp-stdio' | 'mcp-http' | 'managed' | 'filesystem' | 'api';

export type SourceStatus = 'disconnected' | 'connecting' | 'connected' | 'needs_auth' | 'error';

export type SourceCategory =
  | 'google'
  | 'microsoft'
  | 'slack'
  | 'dev'
  | 'storage'
  | 'crm'
  | 'pm'
  | 'other';

export interface SourceMetadata {
  readonly slug: string;
  readonly displayName: string;
  readonly category: SourceCategory;
  readonly requiresAuth: boolean;
  readonly iconUrl?: string;
  readonly description?: string;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

export interface ToolResult {
  readonly content: unknown;
  readonly isError: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SourceConfig {
  readonly slug: string;
  readonly kind: SourceKind;
  readonly config: Readonly<Record<string, unknown>>;
}

export interface ISource extends IDisposable {
  readonly slug: string;
  readonly kind: SourceKind;
  readonly metadata: SourceMetadata;
  readonly status$: Observable<SourceStatus>;

  activate(): Promise<Result<void, SourceError>>;
  deactivate(): Promise<void>;

  listTools(): Promise<Result<readonly ToolDefinition[], SourceError>>;
  callTool(name: string, input: unknown, signal?: AbortSignal): Observable<ToolResult>;

  authenticate?(): Promise<Result<void, SourceError>>;
}

export interface SourceFactory {
  readonly kind: SourceKind;
  supports(config: SourceConfig): boolean;
  create(config: SourceConfig): ISource;
}
