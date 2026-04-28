import { Button } from '@g4os/ui';
import { ArrowRight, FolderKanban, Sparkles, Zap } from 'lucide-react';

export interface WorkspaceLandingChip {
  readonly label: string;
  readonly value: number | string;
}

export interface WorkspaceLandingCanvasProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly brandMark: string;

  readonly primaryActionLabel: string;
  readonly onPrimaryAction: () => void;
  readonly primaryActionDisabled?: boolean;

  readonly recentActionLabel?: string | null;
  readonly onRecentAction?: () => void;
  readonly recentChipLabel?: string | null;

  readonly readyTitle: string;
  readonly readyDescription: string;
  readonly chips: ReadonlyArray<WorkspaceLandingChip>;

  readonly activeLabel: string;
  readonly workspaceName: string;
  readonly recentLine: string;
}

/**
 * Tela inicial pós-login do workspace ativo.
 *
 * Visual close ao `SessionsStartCanvas` da V1: dotted bg, brand mark
 * institucional, eyebrow uppercase, hero card com primary/secondary CTA,
 * grid 2-col com `ReadyPanel` (chips de stats) + `ActiveWorkspacePanel`.
 *
 * Componente é puramente apresentacional — todo data fetching e wiring
 * de navegação fica no route consumer.
 */
export function WorkspaceLandingCanvas({
  eyebrow,
  title,
  description,
  brandMark,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionDisabled,
  recentActionLabel,
  onRecentAction,
  recentChipLabel,
  readyTitle,
  readyDescription,
  chips,
  activeLabel,
  workspaceName,
  recentLine,
}: WorkspaceLandingCanvasProps) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div
        aria-hidden={true}
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(var(--foreground-rgb, 255 255 255), 0.10) 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }}
      />
      <div className="relative flex h-full items-center justify-center px-8 py-10">
        <div className="flex w-full max-w-5xl flex-col gap-6">
          <div className="rounded-[24px] bg-background/90 p-8 shadow-middle backdrop-blur-sm">
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-foreground text-[20px] font-semibold text-background shadow-minimal">
                {brandMark}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {eyebrow}
                </p>
                <h1 className="mt-1 text-[28px] font-semibold leading-tight text-foreground">
                  {title}
                </h1>
              </div>
            </div>

            <p className="max-w-3xl text-base leading-7 text-foreground/80">{description}</p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                onClick={onPrimaryAction}
                disabled={primaryActionDisabled}
                className="h-10 rounded-full px-5"
              >
                <Sparkles className="mr-1.5 h-4 w-4" aria-hidden={true} />
                {primaryActionLabel}
              </Button>
              {recentActionLabel && onRecentAction ? (
                <Button
                  variant="outline"
                  onClick={onRecentAction}
                  className="h-10 rounded-full px-5"
                >
                  <ArrowRight className="mr-1.5 h-4 w-4" aria-hidden={true} />
                  {recentActionLabel}
                </Button>
              ) : null}
              {recentChipLabel ? (
                <span className="rounded-full bg-foreground/[0.04] px-3 py-2 text-xs font-medium text-muted-foreground">
                  {recentChipLabel}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
            <ReadyPanel title={readyTitle} description={readyDescription} chips={chips} />
            <ActiveWorkspacePanel
              label={activeLabel}
              workspaceName={workspaceName}
              recentLine={recentLine}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

interface ReadyPanelProps {
  readonly title: string;
  readonly description: string;
  readonly chips: ReadonlyArray<WorkspaceLandingChip>;
}

function ReadyPanel({ title, description, chips }: ReadyPanelProps) {
  return (
    <section className="rounded-[22px] bg-background/95 p-6 shadow-middle backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-foreground/[0.05] text-foreground">
          <Zap className="h-5 w-5" aria-hidden={true} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <div
            key={chip.label}
            className="min-w-[92px] rounded-[16px] border border-foreground/10 bg-foreground/[0.02] px-3 py-2"
          >
            <div className="text-lg font-semibold text-foreground">{chip.value}</div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {chip.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface ActiveWorkspacePanelProps {
  readonly label: string;
  readonly workspaceName: string;
  readonly recentLine: string;
}

function ActiveWorkspacePanel({ label, workspaceName, recentLine }: ActiveWorkspacePanelProps) {
  return (
    <section className="rounded-[22px] bg-background/95 p-6 shadow-middle backdrop-blur-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-accent/15 text-accent">
          <FolderKanban className="h-5 w-5" aria-hidden={true} />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">{label}</h2>
          <p className="text-sm text-muted-foreground">{workspaceName}</p>
        </div>
      </div>
      <p className="text-sm leading-6 text-foreground/75">{recentLine}</p>
    </section>
  );
}
