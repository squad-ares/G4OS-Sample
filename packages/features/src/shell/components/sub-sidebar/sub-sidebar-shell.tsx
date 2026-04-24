import type { ReactNode } from 'react';

export interface SubSidebarShellProps {
  readonly header?: ReactNode;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}

export function SubSidebarShell({ header, footer, children }: SubSidebarShellProps) {
  return (
    <aside className="relative z-10 hidden h-full w-72 shrink-0 flex-col overflow-hidden rounded-[16px] bg-background shadow-middle lg:flex">
      {header ? (
        <div className="titlebar-no-drag relative z-10 shrink-0 px-4 pb-2 pt-3">{header}</div>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      {footer ? (
        <div className="shrink-0 border-t border-foreground/5 bg-foreground/[0.02] px-3 py-2">
          {footer}
        </div>
      ) : null}
    </aside>
  );
}
