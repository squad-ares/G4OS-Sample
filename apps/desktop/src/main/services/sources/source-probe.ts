/**
 * Probe leve por kind — usado por `SourcesService.testConnection`.
 * NÃO faz handshake MCP completo; validação profunda vira em
 * TASK-OUTLIER-12 Phase 3 com os connectors reais.
 *
 *   - `mcp-http`/`api`: HEAD request com 5s timeout.
 *   - `filesystem`: `access()` no path.
 *   - `mcp-stdio`: spawn + `initialize` JSON-RPC com 5s timeout
 *     (via `@g4os/sources/mcp-stdio` probe helper).
 *   - `managed`: retorna status persistido (aguarda OAuth live mount).
 */

import { createLogger } from '@g4os/kernel/logger';
import type { SourceConfigView, SourceStatus } from '@g4os/kernel/types';
import { probeMcpStdio } from '@g4os/sources/mcp-stdio';

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
  if (source.kind === 'mcp-stdio') return probeStdio(source);
  return Promise.resolve(source.status);
}

function probeStdio(source: SourceConfigView): Promise<SourceStatus> {
  const cfg = source.config as {
    command?: unknown;
    args?: unknown;
    env?: Record<string, string>;
  };
  if (typeof cfg.command !== 'string' || cfg.command.length === 0) {
    return Promise.resolve('disconnected');
  }
  if (!Array.isArray(cfg.args) || !cfg.args.every((a) => typeof a === 'string')) {
    return Promise.resolve('disconnected');
  }
  return probeMcpStdio({
    command: cfg.command,
    args: cfg.args as string[],
    ...(cfg.env ? { env: cfg.env } : {}),
  }).catch((err) => {
    log.debug({ err: String(err), slug: source.slug }, 'mcp-stdio probe threw');
    return 'error' as const;
  });
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
