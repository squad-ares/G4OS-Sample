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
import type { McpHttpClient, McpHttpClientFactory, McpHttpConfig } from './types.ts';

export class McpHttpSource extends DisposableBase implements ISource {
  readonly kind: SourceKind = 'mcp-http';
  readonly slug: string;

  private readonly statusSubject = new BehaviorSubject<SourceStatus>('disconnected');
  private client: McpHttpClient | null = null;

  constructor(
    private readonly config: McpHttpConfig,
    private readonly clientFactory: McpHttpClientFactory,
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

  async activate(): Promise<Result<void, SourceError>> {
    this.statusSubject.next('connecting');
    const client = this.clientFactory.create(this.config);
    const result = await client.connect();
    if (result.isErr()) {
      await client.close().catch(() => undefined);
      const e = result.error;
      if (isHttpAuthError(e)) {
        this.statusSubject.next('needs_auth');
        return err(SourceError.authRequired(this.slug));
      }
      this.statusSubject.next('error');
      return err(SourceError.incompatible(this.slug, `http activation failed: ${e.message}`));
    }

    client.onClose(() => this.statusSubject.next('disconnected'));
    client.onError((e) => {
      if (isHttpAuthError(e)) this.statusSubject.next('needs_auth');
      else this.statusSubject.next('error');
    });

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
    // CR9: distinguir `needs_auth` de outros estados não-ativados. Antes,
    // qualquer estado sem client virava `incompatible`, e o broker (ou UI)
    // perdia o sinal de "user precisa fazer OAuth pra continuar". Agora,
    // `needs_auth` propaga como `authRequired` para o caller decidir
    // mostrar o flow de auth em vez de tratar como erro de compatibilidade.
    if (!this.client) {
      if (this.statusSubject.value === 'needs_auth') {
        return err(SourceError.authRequired(this.slug));
      }
      return err(SourceError.incompatible(this.slug, 'not activated'));
    }
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

function isHttpAuthError(e: Error): boolean {
  const msg = e.message.toLowerCase();
  return msg.includes('401') || msg.includes('403') || msg.includes('unauthor');
}
