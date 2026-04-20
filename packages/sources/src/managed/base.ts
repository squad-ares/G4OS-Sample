import { DisposableBase } from '@g4os/kernel/disposable';
import { SourceError } from '@g4os/kernel/errors';
import { err, ok, type Result } from 'neverthrow';
import { BehaviorSubject, type Observable } from 'rxjs';
import type {
  ISource,
  SourceKind,
  SourceMetadata,
  SourceStatus,
  ToolDefinition,
  ToolResult,
} from '../interface/source.ts';

export interface TokenStore {
  get(slug: string): Promise<string | null>;
  set(slug: string, token: string): Promise<void>;
  delete(slug: string): Promise<void>;
}

export interface ManagedConnectorOptions {
  readonly slug: string;
  readonly metadata: SourceMetadata;
  readonly tokenStore: TokenStore;
  readonly authenticateFn?: () => Promise<Result<string, SourceError>>;
}

/**
 * Base class for managed/Pipedream-style connectors.
 * Subclass implements `provideTools` and `invokeTool`; this class owns
 * token acquisition, status propagation, and dispose hygiene.
 */
export abstract class ManagedConnectorBase extends DisposableBase implements ISource {
  readonly kind: SourceKind = 'managed';
  readonly slug: string;
  readonly metadata: SourceMetadata;

  protected readonly tokenStore: TokenStore;
  protected readonly statusSubject = new BehaviorSubject<SourceStatus>('disconnected');
  protected currentToken: string | null = null;
  private readonly authenticateFn?: () => Promise<Result<string, SourceError>>;

  constructor(options: ManagedConnectorOptions) {
    super();
    this.slug = options.slug;
    this.metadata = options.metadata;
    this.tokenStore = options.tokenStore;
    if (options.authenticateFn) this.authenticateFn = options.authenticateFn;
  }

  get status$(): Observable<SourceStatus> {
    return this.statusSubject.asObservable();
  }

  async activate(): Promise<Result<void, SourceError>> {
    this.statusSubject.next('connecting');
    const token = await this.tokenStore.get(this.slug);
    if (!token) {
      this.statusSubject.next('needs_auth');
      return err(SourceError.authRequired(this.slug));
    }
    this.currentToken = token;
    this.statusSubject.next('connected');
    return ok(undefined);
  }

  deactivate(): Promise<void> {
    this.currentToken = null;
    this.statusSubject.next('disconnected');
    return Promise.resolve();
  }

  async authenticate(): Promise<Result<void, SourceError>> {
    if (!this.authenticateFn) {
      return err(SourceError.authRequired(this.slug));
    }
    const result = await this.authenticateFn();
    if (result.isErr()) {
      this.statusSubject.next('needs_auth');
      return err(result.error);
    }
    await this.tokenStore.set(this.slug, result.value);
    this.currentToken = result.value;
    this.statusSubject.next('connected');
    return ok(undefined);
  }

  listTools(): Promise<Result<readonly ToolDefinition[], SourceError>> {
    if (!this.currentToken) return Promise.resolve(err(SourceError.authRequired(this.slug)));
    return Promise.resolve(ok(this.provideTools()));
  }

  callTool(name: string, input: unknown, signal?: AbortSignal): Observable<ToolResult> {
    return this.invokeTool(name, input, this.currentToken, signal);
  }

  protected abstract provideTools(): readonly ToolDefinition[];
  protected abstract invokeTool(
    name: string,
    input: unknown,
    token: string | null,
    signal?: AbortSignal,
  ): Observable<ToolResult>;

  override dispose(): void {
    void this.deactivate();
    this.statusSubject.complete();
    super.dispose();
  }
}
