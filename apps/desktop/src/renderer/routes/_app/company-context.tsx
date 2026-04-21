import { ShellPlaceholderPage } from '@g4os/features/shell';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/company-context')({
  component: () => <ShellPlaceholderPage pageId="company-context" />,
});
