/**
 * Probe leve por kind — usado por `SourcesService.testConnection`.
 * NÃO faz handshake MCP completo; validação profunda vira em
 * TASK-OUTLIER-12 Phase 3 com os connectors reais.
 *
 *   - `mcp-http`/`api`: HEAD request com 5s timeout.
 *   - `filesystem`: `access()` no path.
 *   - `mcp-stdio`/`managed`: retorna status persistido (follow-up).
 */

import { createLogger } from '@g4os/kernel/logger';
import type { SourceConfigView, SourceStatus } from '@g4os/kernel/types';

const log = createLogger('source-probe');

const HTTP_PROBE_TIMEOUT_MS = 5_000;

export function probeSource(source: SourceConfigView): Promise<SourceStatus> {
  if (source.kind === 'mcp-http' || source.kind === 'api') {
    const url = (source.config as { url?: unknown }).url;
    if (typeof url !== 'string' || url.length === 0) return Promise.resolve(source.status);
    return probeHttp(url);
  }
  if (source.kind === 'filesystem') {
    const path = (source.config as { path?: unknown }).path;
    if (typeof path !== 'string' || path.length === 0) return Promise.resolve('disconnected');
    return probeFilesystem(path);
  }
  return Promise.resolve(source.status);
}

async function probeHttp(url: string): Promise<SourceStatus> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HTTP_PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
      if (res.status === 401 || res.status === 403) return 'needs_auth';
      if (res.status >= 500) return 'error';
      return res.ok ? 'connected' : 'error';
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    log.debug({ err: String(err), url }, 'http probe failed');
    return 'error';
  }
}

async function probeFilesystem(path: string): Promise<SourceStatus> {
  try {
    const { access } = await import('node:fs/promises');
    await access(path);
    return 'connected';
  } catch {
    return 'error';
  }
}
