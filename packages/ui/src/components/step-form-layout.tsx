import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../libs/utils.ts';

interface StepFormLayoutProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function StepFormLayout({
  icon: Icon,
  title,
  description,
  children,
  actions,
  className,
}: StepFormLayoutProps) {
  return (
    <div className={cn('flex w-full flex-col items-center gap-6', className)}>
      <div className="inline-flex size-16 items-center justify-center rounded-full bg-info/10">
        <Icon className="size-8 text-info" aria-hidden="true" />
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-4">{children}</div>

      {actions ? <div className="flex w-full flex-col gap-2">{actions}</div> : null}
    </div>
  );
}
