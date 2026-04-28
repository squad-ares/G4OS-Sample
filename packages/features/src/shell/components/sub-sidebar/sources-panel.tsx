import type { SourceConfigView } from '@g4os/kernel/types';
import { Button, useTranslate } from '@g4os/ui';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  Database,
  FolderOpen,
  Plug,
  Plus,
  Server,
} from 'lucide-react';
import type { ComponentType, ReactNode, SVGProps } from 'react';
import { SubSidebarShell } from './sub-sidebar-shell.tsx';

type SourceKind = SourceConfigView['kind'];
type SourceStatus = SourceConfigView['status'];

export interface SourcesPanelProps {
  readonly sources: readonly SourceConfigView[];
  readonly activeSourceId?: string | undefined;
  readonly loading?: boolean;
  readonly onOpenSource: (id: string) => void;
  readonly onManage: () => void;
  readonly footer?: ReactNode;
}

export function SourcesPanel({
  sources,
  activeSourceId,
  loading = false,
  onOpenSource,
  onManage,
  footer,
}: SourcesPanelProps) {
  const { t } = useTranslate();

  const enabled = sources.filter((s) => s.enabled);
  const disabled = sources.filter((s) => !s.enabled);

  const header = (
    <>
      <Button
        variant="outline"
        className="mb-3 h-10 w-full justify-start gap-2 rounded-[12px] px-3 text-sm font-semibold"
        onClick={onManage}
      >
        <Plus className="h-4 w-4" aria-hidden={true} />
        {t('shell.subsidebar.sources.manage')}
      </Button>

      <div className="px-1 pb-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {t('shell.subsidebar.sources.section')}
        </span>
      </div>
    </>
  );

  return (
    <SubSidebarShell header={header} {...(footer ? { footer } : {})}>
      <div className="mask-fade-bottom min-h-0 flex-1 overflow-y-auto pb-3">
        {loading ? (
          <SourceSkeleton />
        ) : sources.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            {t('shell.subsidebar.sources.empty')}
          </p>
        ) : (
          <>
            {enabled.length > 0 ? (
              <>
                <SubsectionHeader label={t('shell.subsidebar.sources.enabled')} />
                <ul className="flex flex-col gap-0.5 px-2">
                  {enabled.map((s) => (
                    <li key={s.id}>
                      <SourceRow
                        source={s}
                        active={activeSourceId === s.id}
                        onOpen={onOpenSource}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {disabled.length > 0 ? (
              <>
                <SubsectionHeader label={t('shell.subsidebar.sources.disabled')} />
                <ul className="flex flex-col gap-0.5 px-2">
                  {disabled.map((s) => (
                    <li key={s.id}>
                      <SourceRow
                        source={s}
                        active={activeSourceId === s.id}
                        onOpen={onOpenSource}
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </div>
    </SubSidebarShell>
  );
}

interface SubsectionHeaderProps {
  readonly label: string;
}
function SubsectionHeader({ label }: SubsectionHeaderProps) {
  return (
    <div className="px-4 pb-1 pt-3">
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

interface SourceRowProps {
  readonly source: SourceConfigView;
  readonly active: boolean;
  readonly onOpen: (id: string) => void;
}

function SourceRow({ source, active, onOpen }: SourceRowProps) {
  const Icon = kindIcon(source.kind);
  const isError = source.status === 'error' || Boolean(source.lastError);

  return (
    <button
      type="button"
      onClick={() => onOpen(source.id)}
      aria-current={active ? 'true' : undefined}
      className={`flex w-full items-start gap-2 rounded-[10px] px-3 py-2 text-left transition-colors ${
        active ? 'bg-foreground/8 text-foreground' : 'text-foreground/85 hover:bg-accent/12'
      } ${source.enabled ? '' : 'opacity-65'}`}
    >
      <span
        aria-hidden={true}
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-foreground/80"
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span className="line-clamp-1 flex-1 text-[13px] font-medium">{source.displayName}</span>
          <StatusIndicator status={source.status} isError={isError} />
        </div>
        <span className="line-clamp-1 text-[11px] text-muted-foreground">
          {source.description ?? source.slug}
        </span>
      </div>
    </button>
  );
}

interface StatusIndicatorProps {
  readonly status: SourceStatus;
  readonly isError: boolean;
}
function StatusIndicator({ status, isError }: StatusIndicatorProps) {
  if (isError) {
    return <AlertCircle className="size-3 shrink-0 text-destructive" aria-hidden={true} />;
  }
  if (status === 'connected') {
    return <CheckCircle2 className="size-3 shrink-0 text-emerald-500" aria-hidden={true} />;
  }
  return null;
}

function SourceSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-2">
      {['sk-a', 'sk-b', 'sk-c', 'sk-d'].map((k) => (
        <div key={k} className="h-12 animate-pulse rounded-[10px] bg-foreground/5" />
      ))}
    </div>
  );
}

const KIND_ICON: Record<SourceKind, ComponentType<SVGProps<SVGSVGElement>>> = {
  'mcp-stdio': Server,
  'mcp-http': Cloud,
  managed: Plug,
  filesystem: FolderOpen,
  api: Database,
};

function kindIcon(kind: SourceKind): ComponentType<SVGProps<SVGSVGElement>> {
  return KIND_ICON[kind] ?? Plug;
}
