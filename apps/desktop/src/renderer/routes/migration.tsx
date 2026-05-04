import { type MigrationPorts, MigrationWizard } from '@g4os/features';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { trpc } from '../ipc/trpc-client.ts';

export const Route = createFileRoute('/migration')({
  component: MigrationRoute,
});

function MigrationRoute() {
  const navigate = useNavigate();

  const ports: MigrationPorts = {
    detect: () => trpc.migration.detect.query(),
    plan: (input) => trpc.migration.plan.query(input),
    execute: (input) => trpc.migration.execute.mutate(input),
  };

  return (
    <MigrationWizard
      ports={ports}
      onComplete={() => {
        // Pós-migração, redireciona pro shell. Se quiser auto-trigger
        // re-render dos workspaces existentes, invalidate query (futuro).
        void navigate({ to: '/' });
      }}
      onSkip={() => {
        void navigate({ to: '/' });
      }}
    />
  );
}
