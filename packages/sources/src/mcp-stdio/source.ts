import { DisposableBase } from '@g4os/kernel/disposable';
import { SourceError } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import { BehaviorSubject, EMPTY, type Observable } from 'rxjs';
import type {
  ISource,
  SourceKind,
  SourceStatus,
  ToolDefinition,
  ToolResult,
} from '../interface/source.ts';
import { type McpResolvedMode, resolveRuntimeMode } from './runtime-mode.ts';
import type { McpClient, McpClientFactory, McpStdioConfig } from './types.ts';

export class McpStdioSource extends DisposableBase implements ISource {
  readonly kind: SourceKind = 'mcp-stdio';
  readonly slug: string;

  private readonly statusSubject = new BehaviorSubject<SourceStatus>('disconnected');
  private client: McpClient | null = null;
  private resolvedMode: McpResolvedMode | null = null;

  constructor(
    private readonly config: McpStdioConfig,
    private readonly clientFactory: McpClientFactory,
    private readonly platform: NodeJS.Platform = process.platform,
  ) {
    super();
    this.slug = config.slug;
  }

  get metadata() {
    return this.config.metadata;
  }

  get status$(): Observable<SourceStatus> {
    return this.statusSubject.asObservable();
  }

  get runtimeMode(): McpResolvedMode | null {
    return this.resolvedMode;
  }

  async activate(): Promise<Result<void, SourceError>> {
    this.statusSubject.next('connecting');
    this.resolvedMode = resolveRuntimeMode({
      platform: this.platform,
      ...(this.config.executionMode === undefined
        ? {}
        : { executionMode: this.config.executionMode }),
      ...(this.config.needsBrowserAuth === undefined
        ? {}
        : { needsBrowserAuth: this.config.needsBrowserAuth }),
    });

    const client = this.clientFactory.create(this.config);
    const result = await client.connect();
    if (result.isErr()) {
      await client.close().catch(() => undefined);
      const e = result.error;
      if (isAuthError(e)) {
        this.statusSubject.next('needs_auth');
        return err(SourceError.authRequired(this.slug));
      }
      this.statusSubject.next('error');
      return err(SourceError.incompatible(this.slug, `stdio activation failed: ${e.message}`));
    }

    this.client = client;
    this.statusSubject.next('connected');
    return ok(undefined);
  }

  async deactivate(): Promise<void> {
    if (this.client) {
      await this.client.close().catch(() => undefined);
      this.client = null;
    }
    this.statusSubject.next('disconnected');
  }

  async listTools(): Promise<Result<readonly ToolDefinition[], SourceError>> {
    if (!this.client) return err(SourceError.incompatible(this.slug, 'not activated'));
    const tools = await this.client.listTools();
    return ok(tools);
  }

  callTool(name: string, input: unknown, signal?: AbortSignal): Observable<ToolResult> {
    if (!this.client) return EMPTY;
    return this.client.callTool(name, input, signal);
  }

  override dispose(): void {
    void this.deactivate();
    this.statusSubject.complete();
    super.dispose();
  }
}

function isAuthError(e: Error): boolean {
  const msg = e.message.toLowerCase();
  return (
    msg.includes('unauthor') ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('forbidden') ||
    msg.includes('auth required')
  );
}
