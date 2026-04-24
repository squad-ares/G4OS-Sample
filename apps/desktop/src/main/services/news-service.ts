/**
 * NewsService — proxy para o feed `/api/news` do viewer (V1-compatível).
 *
 * O viewer retorna `{ generatedAt, items: [...] }`; aqui retornamos só os
 * items ordenados por `publishDate`/`sortRank`. `get(id)` é servido a partir
 * da mesma lista — o viewer V1 não tem endpoint `/api/news/:id`, então
 * cachamos a lista e resolvemos localmente.
 *
 * Base URL default: `https://g4oscloud.com`. Override via env var
 * `G4OS_VIEWER_URL` (útil para dev/staging).
 */

import type { NewsService } from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { NewsFeedSchema, type NewsItem } from '@g4os/kernel/schemas';
import { err, ok } from 'neverthrow';
import { readRuntimeEnv } from '../runtime-env.ts';

const DEFAULT_VIEWER_URL = 'https://g4oscloud.com';
const NEWS_CACHE_TTL_MS = 5 * 60_000;
const FETCH_TIMEOUT_MS = 10_000;

const log = createLogger('news-service');

export interface NewsServiceDeps {
  readonly viewerUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
}

interface CacheEntry {
  readonly fetchedAt: number;
  readonly items: readonly NewsItem[];
}

export function createNewsService(deps: NewsServiceDeps = {}): NewsService {
  const baseUrl = (
    deps.viewerUrl ??
    readRuntimeEnv('G4OS_VIEWER_URL') ??
    DEFAULT_VIEWER_URL
  ).replace(/\/$/, '');
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => Date.now());
  let cache: CacheEntry | null = null;

  async function loadItems(): Promise<readonly NewsItem[]> {
    if (cache && now() - cache.fetchedAt < NEWS_CACHE_TTL_MS) return cache.items;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(`${baseUrl}/api/news`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new AppError({
          code: ErrorCode.UNKNOWN_ERROR,
          message: `viewer /api/news responded ${response.status}`,
          context: { status: response.status, baseUrl },
        });
      }
      const body = (await response.json()) as unknown;
      const parsed = NewsFeedSchema.safeParse(body);
      if (!parsed.success) {
        throw new AppError({
          code: ErrorCode.UNKNOWN_ERROR,
          message: 'viewer /api/news returned invalid shape',
          context: { issues: parsed.error.issues },
        });
      }
      const items = parsed.data.items;
      cache = { fetchedAt: now(), items };
      return items;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async list() {
      try {
        const items = await loadItems();
        return ok(items);
      } catch (cause) {
        log.error({ err: cause, baseUrl }, 'news.list failed');
        return err(wrap(cause, 'news.list'));
      }
    },
    async get(id) {
      try {
        const items = await loadItems();
        return ok(items.find((item) => item.id === id) ?? null);
      } catch (cause) {
        log.error({ err: cause, id, baseUrl }, 'news.get failed');
        return err(wrap(cause, 'news.get'));
      }
    },
  };
}

function wrap(cause: unknown, scope: string): AppError {
  if (cause instanceof AppError) return cause;
  const message = cause instanceof Error ? cause.message : String(cause);
  return new AppError({
    code: ErrorCode.UNKNOWN_ERROR,
    message: `${scope}: ${message}`,
    context: { scope },
  });
}
