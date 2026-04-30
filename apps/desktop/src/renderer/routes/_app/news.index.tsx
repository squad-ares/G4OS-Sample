/**
 * `/news` index page — quando o usuário navega sem um `newsId` selecionado,
 * rende uma grid com os últimos itens ao invés de um detail vazio.
 *
 * Polling de 30min (useQuery refetchInterval) para fresh content check
 * periódico sem martelar o viewer API. O sidebar panel compartilha o
 * mesmo query key — refetch aqui propaga.
 */

import { NewsDetail } from '@g4os/features/news';
import type { NewsItem } from '@g4os/kernel/types';
import { useTranslate } from '@g4os/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { trpc } from '../../ipc/trpc-client.ts';
import { useSeenNewsIds } from '../../news/seen-store.ts';

const NEWS_LIST_STALE_MS = 60_000;
const NEWS_LIST_REFETCH_MS = 30 * 60 * 1000;

function NewsIndexPage() {
  const { t } = useTranslate();
  const seenIds = useSeenNewsIds();
  const query = useQuery({
    queryKey: ['news', 'list'],
    queryFn: () => trpc.news.list.query(),
    staleTime: NEWS_LIST_STALE_MS,
    refetchInterval: NEWS_LIST_REFETCH_MS,
  });

  if (query.isLoading) {
    return <NewsDetail item={null} />;
  }

  const items: readonly NewsItem[] = query.data ?? [];
  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <p className="text-sm text-muted-foreground">{t('news.list.empty')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">{t('news.list.title')}</h1>
        <p className="text-xs text-muted-foreground">
          {t('news.list.count', { count: items.length })}
        </p>
      </header>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const unread = !seenIds.has(item.id);
          return (
            <li key={item.id}>
              <Link
                to="/news/$newsId"
                params={{ newsId: item.id }}
                className="block h-full rounded-lg border border-border bg-background p-4 transition hover:border-foreground/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-sm font-medium">{item.title}</h3>
                  {unread && (
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary"
                      role="status"
                      aria-label={t('news.list.unread')}
                    />
                  )}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {formatDate(item.publishDate)}
                </p>
                <p className="mt-2 line-clamp-3 text-xs text-foreground/80">
                  {previewFromMarkdown(item.markdown)}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function previewFromMarkdown(markdown: string): string {
  // Strip básico pra cards de lista — sem markdown rendering completo.
  const plain = markdown
    .replace(/```[\s\S]*?```/g, '') // blocos de código
    .replace(/^#.*$/gm, '') // headings
    .replace(/[*_`>]/g, '') // marks inline
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // imagens
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // links
    .trim();
  return plain.slice(0, 240);
}

export const Route = createFileRoute('/_app/news/')({
  component: NewsIndexPage,
});
