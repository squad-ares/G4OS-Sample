import { createServer, type Server } from 'node:http';

export interface LoopbackServer {
  readonly url: string;
  wait(): Promise<URLSearchParams>;
  close(): Promise<void>;
}

const HTML =
  '<!doctype html><meta charset="utf-8"><title>Auth complete</title>' +
  '<h1>Authentication complete</h1><p>You can close this window.</p>';

export async function startLoopbackServer(
  port = 0,
  pathname = '/callback',
): Promise<LoopbackServer> {
  let resolver: ((params: URLSearchParams) => void) | null = null;
  const waiter = new Promise<URLSearchParams>((resolve) => {
    resolver = resolve;
  });

  const server: Server = createServer((req, res) => {
    if (!req.url) {
      res.writeHead(400).end();
      return;
    }
    const url = new URL(req.url, 'http://127.0.0.1');
    if (url.pathname !== pathname) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
    resolver?.(url.searchParams);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  const boundPort = typeof address === 'object' && address ? address.port : port;

  return {
    url: `http://127.0.0.1:${boundPort}${pathname}`,
    wait: () => waiter,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}
