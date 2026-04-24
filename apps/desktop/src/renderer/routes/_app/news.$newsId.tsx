import { NewsDetail } from '@g4os/features/news';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { trpc } from '../../ipc/trpc-client.ts';
import { markAsSeen } from '../../news/seen-store.ts';

function NewsDetailPage() {
  const { newsId } = Route.useParams();
  const query = useQuery({
    queryKey: ['news', 'list'],
    queryFn: () => trpc.news.list.query(),
    staleTime: 5 * 60_000,
  });
  const item = query.data?.find((n) => n.id === newsId) ?? null;

  useEffect(() => {
    if (item) markAsSeen(item.id);
  }, [item]);

  return <NewsDetail item={item} />;
}

export const Route = createFileRoute('/_app/news/$newsId')({
  component: NewsDetailPage,
});
