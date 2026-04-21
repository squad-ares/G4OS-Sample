interface AuthErrorBannerProps {
  readonly message: string;
}

export function AuthErrorBanner({ message }: AuthErrorBannerProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {message}
    </div>
  );
}
