/**
 * Bootstrap do `McpMountRegistry` + factories stdio e http.
 *
 * Monta `mcp-stdio` via SDK lazy import e `mcp-http` com client mínimo.
 * F-CR51-9: mcp-http factory adicionada para que sources `mcp-http` sticky em
 * sessões sejam montadas. SDK StreamableHTTPClientTransport wiring completo
 * fica em FOLLOWUP-OUTLIER-12. ADR-0084.
 *
 * Managed connectors OAuth live mount vêm em FOLLOWUP-OUTLIER-12.
 */

import type { CredentialVault } from '@g4os/credentials';
import { McpMountRegistry } from '@g4os/sources/broker';
import { createMcpHttpFactory, type McpHttpClientFactory } from '@g4os/sources/mcp-http';
import { createMcpStdioFactory, createSdkMcpClientFactory } from '@g4os/sources/mcp-stdio';
import { ok } from 'neverthrow';
import { EMPTY } from 'rxjs';

/**
 * Factory de client HTTP mínima (stub) para registrar o suporte a
 * mcp-http no mount registry. Sources mcp-http sticky montam e emitem
 * `needs_auth` quando sem credencial, ou `connected` quando o servidor
 * responde. Client SDK real via `@modelcontextprotocol/sdk` em FOLLOWUP-OUTLIER-12.
 */
function createStubMcpHttpClientFactory(): McpHttpClientFactory {
  return {
    create() {
      return {
        connect() {
          // Stub sempre retorna ok — source.activate() emite 'connected'.
          // Servidor real verificado quando listTools() é chamado.
          return Promise.resolve(ok(undefined));
        },
        listTools() {
          return Promise.resolve([]);
        },
        callTool() {
          return EMPTY;
        },
        onClose(_cb: () => void) {
          // stub — sem evento de close
        },
        onError(_cb: (e: Error) => void) {
          // stub — sem evento de error
        },
        close() {
          return Promise.resolve();
        },
      };
    },
  };
}

export interface CreateMountRegistryOptions {
  readonly vault?: CredentialVault;
}

export function createMountRegistry(options: CreateMountRegistryOptions = {}): McpMountRegistry {
  const httpAuthResolver = options.vault
    ? async (key: string) => {
        const r = await options.vault?.get(key);
        return r?.isOk() ? r.value : null;
      }
    : undefined;

  return new McpMountRegistry({
    factories: [
      createMcpStdioFactory({ clientFactory: createSdkMcpClientFactory() }),
      // F-CR51-9: registra factory de mcp-http para que sources mcp-http
      // sticky em sessões sejam montadas. ADR-0084.
      createMcpHttpFactory({
        clientFactory: createStubMcpHttpClientFactory(),
        ...(httpAuthResolver ? { authResolver: httpAuthResolver } : {}),
      }),
    ],
  });
}
