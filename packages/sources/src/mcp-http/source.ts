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
import type {
  McpHttpAuthResolver,
  McpHttpClient,
  McpHttpClientFactory,
  McpHttpConfig,
} from './types.ts';

export class McpHttpSource extends DisposableBase implements ISource {
  readonly kind: SourceKind = 'mcp-http';
  readonly slug: string;

  private readonly statusSubject = new BehaviorSubject<SourceStatus>('disconnected');
  private client: McpHttpClient | null = null;

  constructor(
    private readonly config: McpHttpConfig,
    private readonly clientFactory: McpHttpClientFactory,
    private readonly authResolver?: McpHttpAuthResolver,
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
    // CR-18 F-S1: resolve `authCredentialKey` (se presente) → header
    // `Authorization: Bearer <token>`. Sem o resolver wired, fields config
    // legacy sem auth seguem funcionando; com chave ausente do vault,
    // emitimos `needs_auth` para a UI mostrar fluxo de re-auth.
    const resolved = await this.resolveAuthHeaders();
    if (resolved.isErr()) return err(resolved.error);
    const effectiveConfig: McpHttpConfig = {
      ...this.config,
      headers: { ...(this.config.headers ?? {}), ...resolved.value },
    };
    const client = this.clientFactory.create(effectiveConfig);
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
    // Distinguir `needs_auth` de outros estados não-ativados. Antes,
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

  private async resolveAuthHeaders(): Promise<Result<Record<string, string>, SourceError>> {
    // Sem credential key: respeita configs legacy sem auth, ou que usam
    // `authToken` plaintext (deprecated mas suportado em runtime).
    if (!this.config.authCredentialKey) {
      if (this.config.authToken) {
        return ok({ Authorization: `Bearer ${this.config.authToken}` });
      }
      return ok({});
    }
    if (!this.authResolver) {
      // Caller esqueceu de injetar o resolver. Fail fast com `incompatible`
      // — esse caminho indica config drift (slug declarado authCredentialKey
      // mas factory criada sem resolver), não problema de runtime do user.
      return err(
        SourceError.incompatible(
          this.slug,
          'authCredentialKey set but no authResolver injected in factory options',
        ),
      );
    }
    const token = await this.authResolver(this.config.authCredentialKey);
    if (!token) {
      this.statusSubject.next('needs_auth');
      return err(SourceError.authRequired(this.slug));
    }
    return ok({ Authorization: `Bearer ${token}` });
  }
}

function isHttpAuthError(e: Error): boolean {
  const msg = e.message.toLowerCase();
  return msg.includes('401') || msg.includes('403') || msg.includes('unauthor');
}
