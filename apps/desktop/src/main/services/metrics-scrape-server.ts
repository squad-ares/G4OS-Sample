import { createServer, type Server } from 'node:http';
import { createLogger } from '@g4os/kernel/logger';
import { exportContentType, exportMetrics } from '@g4os/observability/metrics';

const log = createLogger('metrics-scrape');

/**
 * Expõe `/metrics` no formato Prometheus text para que o Prometheus
 * (ou o OTel Collector) consiga scrapeá-lo via `host.docker.internal:PORT`.
 * Só é iniciado quando `G4OS_OTEL_ENDPOINT` está configurado.
 */
export function startMetricsScrapeServer(port = 9464): Server {
  const server = createServer(async (_req, res) => {
    try {
      res.writeHead(200, { 'Content-Type': exportContentType() });
      res.end(await exportMetrics());
    } catch {
      res.writeHead(500).end();
    }
  });
  server.listen(port, '0.0.0.0', () => log.info({ port }, 'prometheus scrape endpoint listening'));
  server.on('error', (err) => log.warn({ err }, 'metrics scrape server error'));
  return server;
}
