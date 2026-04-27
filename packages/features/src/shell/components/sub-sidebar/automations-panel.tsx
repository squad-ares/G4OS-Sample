import { Button, useTranslate } from '@g4os/ui';
import { Bot, Calendar, Eye, Plus, Workflow } from 'lucide-react';
import type { ReactNode } from 'react';
import { SubSidebarShell } from './sub-sidebar-shell.tsx';

export type AutomationKind = 'workflow' | 'schedule' | 'watcher' | 'agent';

export interface AutomationPanelItem {
  readonly id: string;
  readonly name: string;
  readonly kind: AutomationKind;
  readonly description?: string;
  readonly active?: boolean;
  readonly nextRun?: string;
}

export interface AutomationsPanelProps {
  readonly items: readonly AutomationPanelItem[];
  readonly activeItemId?: string | undefined;
  readonly loading?: boolean;
  readonly onOpenItem: (id: string) => void;
  readonly onNewAutomation: () => void;
  readonly footer?: ReactNode;
}

export function AutomationsPanel({
  items,
  activeItemId,
  loading = false,
  onOpenItem,
  onNewAutomation,
  footer,
}: AutomationsPanelProps) {
  const { t } = useTranslate();

  const header = (
    <>
      <Button
        variant="outline"
        className="mb-3 h-10 w-full justify-start gap-2 rounded-[12px] px-3 text-sm font-semibold"
        onClick={onNewAutomation}
      >
        <Plus className="h-4 w-4" aria-hidden={true} />
        {t('shell.subsidebar.automations.new')}
      </Button>

      <div className="px-1 pb-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {t('shell.subsidebar.automations.section')}
        </span>
      </div>
    </>
  );

  return (
    <SubSidebarShell header={header} {...(footer ? { footer } : {})}>
      <div className="mask-fade-bottom min-h-0 flex-1 overflow-y-auto pb-3">
        {loading ? (
          <div className="flex flex-col gap-1 px-2">
            {['sk-a', 'sk-b'].map((k) => (
              <div key={k} className="h-12 animate-pulse rounded-[10px] bg-foreground/5" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="flex flex-col gap-0.5 px-2">
            {items.map((item) => (
              <li key={item.id}>
                <AutomationRow item={item} active={activeItemId === item.id} onOpen={onOpenItem} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </SubSidebarShell>
  );
}

interface AutomationRowProps {
  readonly item: AutomationPanelItem;
  readonly active: boolean;
  readonly onOpen: (id: string) => void;
}

function AutomationRow({ item, active, onOpen }: AutomationRowProps) {
  const Icon = kindIcon(item.kind);
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      aria-current={active ? 'true' : undefined}
      className={`flex w-full items-start gap-2 rounded-[10px] px-3 py-2 text-left transition-colors ${
        active ? 'bg-foreground/8 text-foreground' : 'text-foreground/85 hover:bg-foreground/5'
      } ${item.active === false ? 'opacity-65' : ''}`}
    >
      <span
        aria-hidden={true}
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-foreground/80"
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="line-clamp-1 text-[13px] font-medium">{item.name}</span>
        <span className="line-clamp-1 text-[11px] text-muted-foreground">
          {item.nextRun ?? item.description ?? ''}
        </span>
      </div>
    </button>
  );
}

function EmptyState() {
  const { t } = useTranslate();
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-foreground/[0.05] text-foreground/80">
        <Workflow className="h-6 w-6" aria-hidden={true} />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">
          {t('shell.subsidebar.automations.emptyTitle')}
        </h3>
        <p className="text-xs text-muted-foreground">
          {t('shell.subsidebar.automations.emptyDescription')}
        </p>
      </div>
    </div>
  );
}

function kindIcon(kind: AutomationKind) {
  switch (kind) {
    case 'workflow':
      return Workflow;
    case 'schedule':
      return Calendar;
    case 'watcher':
      return Eye;
    case 'agent':
      return Bot;
  }
}
