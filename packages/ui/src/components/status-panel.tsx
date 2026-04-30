import type { ReactNode } from 'react';

/**
 * Status panel genérico — card com tom (default/warning/danger), badge,
 * título, descrição e children opcionais. Movido de `@g4os/features/shell`
 * para `@g4os/ui` para permitir uso cross-feature sem violar boundary
 * `no-cross-feature-imports`.
 */
export interface StatusPanelProps {
  readonly title: string;
  readonly description: string;
  readonly tone?: 'default' | 'warning' | 'danger';
  readonly badge?: string;
  readonly role?: 'status' | 'alert';
  readonly children?: ReactNode;
}

export function StatusPanel({
  title,
  description,
  tone = 'default',
  badge,
  role = 'status',
  children,
}: StatusPanelProps) {
  const toneClass =
    tone === 'warning'
      ? 'border-accent/30 bg-accent/8'
      : tone === 'danger'
        ? 'border-destructive/30 bg-destructive/8'
        : 'border-foreground/10 bg-background/82';

  return (
    <div
      role={role}
      aria-live={role === 'alert' ? 'assertive' : 'polite'}
      className={`rounded-[24px] border p-5 shadow-[0_14px_34px_rgba(0,31,53,0.06)] ${toneClass}`}
    >
      {badge ? (
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
          {badge}
        </div>
      ) : null}
      <h2 className="mt-2 text-lg font-semibold tracking-[-0.02em] text-foreground">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
