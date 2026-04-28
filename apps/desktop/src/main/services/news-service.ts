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
 *
 * Dispose: aborta requisições em voo e cancela timers de timeout pendentes
 * para que o shutdown 5s do AppLifecycle não fique aguardando fetches.
 */

import type { NewsService } from '@g4os/ipc/server';
import { DisposableBase } from '@g4os/kernel/disposable';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import { NewsFeedSchema, type NewsItem } from '@g4os/kernel/schemas';
import { err, ok, type Result } from 'neverthrow';
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

class NewsServiceImpl extends DisposableBase implements NewsService {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  /**
   * CR4-24: usamos `Set` per-fetch manual em vez de `_register` por entry.
   * Cada `loadItems()` cria controller+timer e remove ambos em `finally`.
   * `_register` acumularia disposables no `DisposableStore` da classe pelo
   * lifetime do service — em uso prolongado (semanas sem dispose) cresceria
   * sem bound. O Set é limpado em cada ciclo + `dispose()` faz sweep final.
   */
  private readonly inflight = new Set<AbortController>();
  private readonly pendingTimers = new Set<ReturnType<typeof setTimeout>>();
  private cache: CacheEntry | null = null;

  constructor(deps: NewsServiceDeps = {}) {
    super();
    this.baseUrl = (
      deps.viewerUrl ??
      readRuntimeEnv('G4OS_VIEWER_URL') ??
      DEFAULT_VIEWER_URL
    ).replace(/\/$/, '');
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.now = deps.now ?? (() => Date.now());
  }

  async list(): Promise<Result<readonly NewsItem[], AppError>> {
    try {
      const items = await this.loadItems();
      return ok(items);
    } catch (cause) {
      log.error({ err: cause, baseUrl: this.baseUrl }, 'news.list failed');
      return err(wrap(cause, 'news.list'));
    }
  }

  async get(id: string): Promise<Result<NewsItem | null, AppError>> {
    try {
      const items = await this.loadItems();
      return ok(items.find((item) => item.id === id) ?? null);
    } catch (cause) {
      log.error({ err: cause, id, baseUrl: this.baseUrl }, 'news.get failed');
      return err(wrap(cause, 'news.get'));
    }
  }

  override dispose(): void {
    if (this._disposed) return;
    for (const controller of this.inflight) controller.abort();
    this.inflight.clear();
    for (const timer of this.pendingTimers) clearTimeout(timer);
    this.pendingTimers.clear();
    super.dispose();
  }

  private async loadItems(): Promise<readonly NewsItem[]> {
    if (this.cache && this.now() - this.cache.fetchedAt < NEWS_CACHE_TTL_MS) {
      return this.cache.items;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    this.inflight.add(controller);
    this.pendingTimers.add(timer);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/news`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new AppError({
          code: ErrorCode.UNKNOWN_ERROR,
          message: `viewer /api/news responded ${response.status}`,
          context: { status: response.status, baseUrl: this.baseUrl },
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
      this.cache = { fetchedAt: this.now(), items };
      return items;
    } finally {
      clearTimeout(timer);
      this.pendingTimers.delete(timer);
      this.inflight.delete(controller);
    }
  }
}

export type DisposableNewsService = NewsService & { dispose(): void };

export function createNewsService(deps: NewsServiceDeps = {}): DisposableNewsService {
  return new NewsServiceImpl(deps);
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
