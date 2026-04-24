import { DEFAULT_SETTINGS_CATEGORY } from '@g4os/features/settings';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/settings/')({
  beforeLoad: () => {
    throw redirect({
      to: '/settings/$category',
      params: { category: DEFAULT_SETTINGS_CATEGORY },
    });
  },
});
