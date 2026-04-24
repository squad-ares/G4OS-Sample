import { NewsDetail } from '@g4os/features/news';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/news/')({
  component: () => <NewsDetail item={null} />,
});
