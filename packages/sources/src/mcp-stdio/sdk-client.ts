/**
 * `McpClient` implementation backed by `@modelcontextprotocol/sdk`.
 *
 * Lazy-loads the SDK via dynamic import so `@g4os/sources` stays importable
 * in contexts where the SDK isn't installed (tests, scaffolding). Callers
 * wire the real factory into the broker when the main desktop process is
 * ready to mount stdio MCP sources for live tool calls.
 *
 * DI-friendly: `createSdkMcpClientFactory({ loadSdk })` accepts a custom
 * loader so tests can inject a fake SDK without spawning subprocesses.
 */

import { err, ok, type Result } from 'neverthrow';
import { Observable } from 'rxjs';
import type { ToolDefinition, ToolResult } from '../interface/source.ts';
import type { McpClient, McpClientFactory, McpStdioConfig } from './types.ts';

/** Minimum surface of `@modelcontextprotocol/sdk` Client that we actually use. */
export interface SdkClientLike {
  connect(transport: unknown): Promise<void>;
  listTools(): Promise<{
    readonly tools: readonly {
      readonly name: string;
      readonly description?: string;
      readonly inputSchema: Readonly<Record<string, unknown>>;
    }[];
  }>;
  callTool(params: { readonly name: string; readonly arguments?: unknown }): Promise<{
    readonly content: unknown;
    readonly isError?: boolean;
  }>;
  close(): Promise<void>;
}

export interface SdkStdioTransportParams {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface SdkBindings {
  createClient(info: { readonly name: string; readonly version: string }): SdkClientLike;
  createStdioTransport(params: SdkStdioTransportParams): unknown;
}

export interface CreateSdkMcpClientFactoryOptions {
  /** Lazy SDK loader. Default: dynamic import of `@modelcontextprotocol/sdk`. */
  readonly loadSdk?: () => Promise<SdkBindings>;
  readonly clientInfo?: { readonly name: string; readonly version: string };
}

export function createSdkMcpClientFactory(
  options: CreateSdkMcpClientFactoryOptions = {},
): McpClientFactory {
  const loadSdk = options.loadSdk ?? defaultLoadSdk;
  const clientInfo = options.clientInfo ?? { name: 'g4os', version: '0.0.1' };

  return {
    create: (config: McpStdioConfig): McpClient => new SdkMcpClient(config, loadSdk, clientInfo),
  };
}

class SdkMcpClient implements McpClient {
  private client: SdkClientLike | null = null;

  constructor(
    private readonly config: McpStdioConfig,
    private readonly loadSdk: () => Promise<SdkBindings>,
    private readonly clientInfo: { readonly name: string; readonly version: string },
  ) {}

  async connect(): Promise<Result<void, Error>> {
    try {
      const sdk = await this.loadSdk();
      const client = sdk.createClient(this.clientInfo);
      const transport = sdk.createStdioTransport({
        command: this.config.command,
        args: [...this.config.args],
        ...(this.config.env ? { env: { ...this.config.env } } : {}),
      });
      await client.connect(transport);
      this.client = client;
      return ok(undefined);
    } catch (e) {
      return err(e instanceof Error ? e : new Error(String(e)));
    }
  }

  async listTools(): Promise<readonly ToolDefinition[]> {
    if (!this.client) return [];
    const res = await this.client.listTools();
    return res.tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      inputSchema: t.inputSchema,
    }));
  }

  callTool(name: string, input: unknown, signal?: AbortSignal): Observable<ToolResult> {
    return new Observable<ToolResult>((subscriber) => {
      const client = this.client;
      if (!client) {
        subscriber.error(new Error('not connected'));
        return;
      }
      let cancelled = false;
      const onAbort = (): void => {
        cancelled = true;
      };
      signal?.addEventListener('abort', onAbort);

      client
        .callTool({ name, arguments: input as Record<string, unknown> })
        .then((r) => {
          if (cancelled) return;
          subscriber.next({ content: r.content, isError: r.isError === true });
          subscriber.complete();
        })
        .catch((e) => {
          if (cancelled) return;
          subscriber.error(e instanceof Error ? e : new Error(String(e)));
        });

      return () => {
        signal?.removeEventListener('abort', onAbort);
      };
    });
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close().catch(() => undefined);
      this.client = null;
    }
  }
}

async function defaultLoadSdk(): Promise<SdkBindings> {
  const clientSpec = '@modelcontextprotocol/sdk/client/index.js';
  const stdioSpec = '@modelcontextprotocol/sdk/client/stdio.js';
  const [clientMod, stdioMod] = await Promise.all([
    import(/* @vite-ignore */ clientSpec),
    import(/* @vite-ignore */ stdioSpec),
  ]);
  const ClientCtor = (
    clientMod as {
      readonly Client: new (info: { name: string; version: string }) => SdkClientLike;
    }
  ).Client;
  const StdioCtor = (
    stdioMod as { readonly StdioClientTransport: new (params: SdkStdioTransportParams) => unknown }
  ).StdioClientTransport;
  return {
    createClient: (info) => new ClientCtor(info),
    createStdioTransport: (params) => new StdioCtor(params),
  };
}
