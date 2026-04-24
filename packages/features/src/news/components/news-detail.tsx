import type { NewsItem } from '@g4os/kernel/types';
import { useTranslate } from '@g4os/ui';
import { MarkdownRenderer } from '@g4os/ui/markdown';

export interface NewsDetailProps {
  readonly item: NewsItem | null;
}

export function NewsDetail({ item }: NewsDetailProps) {
  const { t } = useTranslate();

  if (!item) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        {t('news.detail.empty')}
      </div>
    );
  }

  return (
    <article className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-8 py-8">
        <header className="mb-6 border-b border-border pb-4">
          <h1 className="text-2xl font-semibold text-foreground">{item.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">{formatFullDate(item.publishDate)}</p>
        </header>
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <MarkdownRenderer content={item.markdown} />
        </div>
      </div>
    </article>
  );
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
