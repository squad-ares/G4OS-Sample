import type { ReactNode } from 'react';

export interface PageScaffoldProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
}

/**
 * Scaffolding padrão para páginas de settings/feature — hero card no
 * topo com eyebrow/título/descrição + área de conteúdo abaixo.
 *
 * Extraído de `ShellPageScaffold` (shell-page.tsx) para eliminar a
 * dependência cruzada `settings → shell`.
 */
export function PageScaffold({ eyebrow, title, description, children }: PageScaffoldProps) {
  return (
    <section className="h-full overflow-y-auto p-6 md:p-8">
      <div className="space-y-6 pb-6">
        <div className="rounded-[28px] border border-foreground/10 p-6 shadow-[0_18px_48px_rgba(0,31,53,0.08)]">
          {eyebrow ? (
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-foreground">
            {title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{description}</p>
        </div>
        {children}
      </div>
    </section>
  );
}
