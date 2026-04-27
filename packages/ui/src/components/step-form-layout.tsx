import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../libs/utils.ts';

interface StepFormLayoutProps {
  /** Ícone Lucide a renderizar dentro do círculo padrão (azul/info). */
  readonly icon?: LucideIcon;
  /**
   * Elemento React custom a renderizar no lugar do ícone padrão.
   * Quando passado, substitui o `icon` e ignora o estilo padrão. Útil
   * para ícones com cor diferente (ex.: `error` em reauth).
   */
  readonly iconElement?: ReactNode;
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function StepFormLayout({
  icon: Icon,
  iconElement,
  title,
  description,
  children,
  actions,
  className,
}: StepFormLayoutProps) {
  return (
    <div className={cn('flex w-full flex-col items-center gap-6', className)}>
      {iconElement ? (
        iconElement
      ) : Icon ? (
        <div className="inline-flex size-16 items-center justify-center rounded-full bg-info/10">
          <Icon className="size-8 text-info" aria-hidden="true" />
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <div className="max-w-sm text-sm leading-6 text-muted-foreground">{description}</div>
        ) : null}
      </div>

      <div className="flex w-full flex-col gap-4">{children}</div>

      {actions ? <div className="flex w-full flex-col gap-2">{actions}</div> : null}
    </div>
  );
}
