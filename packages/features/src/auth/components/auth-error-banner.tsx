import { AlertCircle } from 'lucide-react';

interface AuthErrorBannerProps {
  readonly message: string;
}

export function AuthErrorBanner({ message }: AuthErrorBannerProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex items-start gap-2 rounded-[14px] border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="leading-5">{message}</span>
    </div>
  );
}
