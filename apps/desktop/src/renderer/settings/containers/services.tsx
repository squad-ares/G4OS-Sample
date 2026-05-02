import { type ServiceStatusItem, ServicesCategory } from '@g4os/features/settings';
import { useQuery } from '@tanstack/react-query';
import { trpc } from '../../ipc/trpc-client.ts';

const SERVICES_STATUS_KEY = ['health', 'servicesStatus'] as const;

export function ServicesCategoryContainer() {
  const query = useQuery({
    queryKey: SERVICES_STATUS_KEY,
    queryFn: () => trpc.health.servicesStatus.query(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const data = query.data;
  const items: ServiceStatusItem[] = data
    ? [
        {
          id: 'sentry',
          labelKey: 'settings.services.sentry.label',
          descriptionKey: 'settings.services.sentry.description',
          ...data.sentry,
        },
        {
          id: 'otel',
          labelKey: 'settings.services.otel.label',
          descriptionKey: 'settings.services.otel.description',
          ...data.otel,
        },
        {
          id: 'metrics',
          labelKey: 'settings.services.metrics.label',
          descriptionKey: 'settings.services.metrics.description',
          ...data.metricsServer,
        },
      ]
    : [];

  return (
    <ServicesCategory
      items={items}
      isLoading={query.isLoading}
      isFetching={query.isFetching}
      isError={query.isError}
      lastCheckedAt={query.dataUpdatedAt || null}
      onRefresh={() => void query.refetch()}
    />
  );
}
