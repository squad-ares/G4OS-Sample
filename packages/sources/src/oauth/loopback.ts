import { createServer, type Server } from 'node:http';

export interface LoopbackServerOptions {
  readonly port?: number;
  readonly pathname?: string;
  /** Timeout em ms para `wait()`. Após o timeout, rejeita com `OAuthTimeout`. */
  readonly timeoutMs?: number;
  /** Se true, fecha o server automaticamente após a primeira resposta válida. */
  readonly autoClose?: boolean;
}

export interface LoopbackServer {
  readonly url: string;
  wait(): Promise<URLSearchParams>;
  close(): Promise<void>;
}

const HTML =
  '<!doctype html><meta charset="utf-8"><title>Auth complete</title>' +
  '<h1>Authentication complete</h1><p>You can close this window.</p>';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 min

export async function startLoopbackServer(
  portOrOptions: number | LoopbackServerOptions = 0,
  pathname?: string,
): Promise<LoopbackServer> {
  const options: LoopbackServerOptions =
    typeof portOrOptions === 'number'
      ? { port: portOrOptions, ...(pathname === undefined ? {} : { pathname }) }
      : portOrOptions;

  const port = options.port ?? 0;
  const callbackPath = options.pathname ?? '/callback';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const autoClose = options.autoClose ?? true;

  let resolver: ((params: URLSearchParams) => void) | null = null;
  let rejecter: ((cause: unknown) => void) | null = null;
  let timeoutHandle: NodeJS.Timeout | null = null;
  let closed = false;

  const waiter = new Promise<URLSearchParams>((resolve, reject) => {
    resolver = resolve;
    rejecter = reject;
  });

  const close = (): Promise<void> =>
    new Promise((resolve) => {
      if (closed) return resolve();
      closed = true;
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      server.close(() => resolve());
    });

  const server: Server = createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400).end();
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== callbackPath) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    resolver?.(url.searchParams);
    if (autoClose) {
      // Não bloqueia o response — close em microtask
      void close();
    }
  });

  // Tenta listen com retry quando porta já está em uso (TCP race
  // entre teardown anterior em FIN_WAIT2 e novo bind). Se `port: 0` (default),
  // fallback escolhe portas aleatórias no range ephemeral; se port fixo,
  // só uma tentativa é feita (caller pediu porta específica).
  const MAX_LISTEN_ATTEMPTS = port === 0 ? 3 : 1;
  let lastErr: unknown;
  let bound = false;
  for (let attempt = 0; attempt < MAX_LISTEN_ATTEMPTS && !bound; attempt++) {
    const tryPort = attempt === 0 ? port : 49152 + Math.floor(Math.random() * 16000);
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (err: unknown) => reject(err);
        server.once('error', onError);
        server.listen(tryPort, '127.0.0.1', () => {
          server.removeListener('error', onError);
          resolve();
        });
      });
      bound = true;
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string } | null)?.code;
      if (code !== 'EADDRINUSE') break;
      // pequena espera antes de retentar pra evitar busy-loop
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  if (!bound) {
    throw lastErr ?? new Error('OAuth loopback server failed to listen');
  }

  // Timeout — rejeita o waiter se o usuário fechar a aba sem completar
  // o redirect. Antes, o handle ficava pendurado pra sempre.
  timeoutHandle = setTimeout(() => {
    if (closed) return;
    rejecter?.(new Error(`OAuth loopback timed out after ${timeoutMs}ms`));
    void close();
  }, timeoutMs);
  // Não trava graceful shutdown em Electron quit
  timeoutHandle.unref?.();

  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;

  return {
    url: `http://127.0.0.1:${boundPort}${callbackPath}`,
    wait: () => waiter,
    close,
  };
}
