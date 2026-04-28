import { Button, StatusPanel, useTranslate } from '@g4os/ui';
import { RotateCcw, ShieldCheck, ShieldQuestion, Wrench } from 'lucide-react';
import type { ReactNode } from 'react';

export interface ToolPermissionDecisionView {
  readonly toolName: string;
  readonly argsHash: string;
  readonly argsPreview: string;
  readonly decidedAt: number;
}

export interface PermissionsCategoryProps {
  /** Decisões `allow_always` de tool use persistidas (OUTLIER-09 Phase 2). */
  readonly toolDecisions?: readonly ToolPermissionDecisionView[];
  readonly onRevokeTool?: (toolName: string, argsHash: string) => void;
  /** Sessões com sticky mounts (fonte aprovada sem expirar). */
  readonly stickyBySession?: ReadonlyArray<{
    readonly sessionId: string;
    readonly sessionName: string;
    readonly sticky: readonly string[];
  }>;
  readonly rejectedBySession?: ReadonlyArray<{
    readonly sessionId: string;
    readonly sessionName: string;
    readonly rejected: readonly string[];
  }>;
  readonly onClearSession?: (sessionId: string) => void;
  readonly onClearAll?: () => void;
}

/**
 * PermissionsCategory — lista decisões de sources mountadas (sticky) e
 * vetadas (rejected) por sessão. Em OUTLIER-09 Phase 2 vai ganhar lista de
 * tool-level permissions (allow_session / allow_always persistidas).
 */
export function PermissionsCategory(props: PermissionsCategoryProps): ReactNode {
  const { t } = useTranslate();
  const sticky = props.stickyBySession ?? [];
  const rejected = props.rejectedBySession ?? [];
  const tools = props.toolDecisions ?? [];
  const isEmpty = sticky.length === 0 && rejected.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <StatusPanel
        title={t('settings.permissions.tools.title')}
        description={t('settings.permissions.tools.description')}
      >
        {tools.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            {t('settings.permissions.tools.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {tools.map((d) => (
              <ToolDecisionRow
                key={`${d.toolName}-${d.argsHash}`}
                decision={d}
                {...(props.onRevokeTool ? { onRevoke: props.onRevokeTool } : {})}
              />
            ))}
          </ul>
        )}
      </StatusPanel>

      <StatusPanel
        title={t('settings.permissions.sources.title')}
        description={t('settings.permissions.sources.description')}
      >
        {isEmpty ? (
          <EmptySourcePermissions />
        ) : (
          <div className="flex flex-col gap-3">
            {sticky.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t('settings.permissions.sources.mountedTitle')}
                </h3>
                <ul className="flex flex-col gap-1">
                  {sticky.map((entry) => (
                    <SessionRow
                      key={`sticky-${entry.sessionId}`}
                      sessionName={entry.sessionName}
                      slugs={entry.sticky}
                      icon={
                        <ShieldCheck className="size-3.5 text-emerald-500" aria-hidden={true} />
                      }
                      onClear={
                        props.onClearSession
                          ? () => props.onClearSession?.(entry.sessionId)
                          : undefined
                      }
                    />
                  ))}
                </ul>
              </div>
            )}
            {rejected.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  {t('settings.permissions.sources.rejectedTitle')}
                </h3>
                <ul className="flex flex-col gap-1">
                  {rejected.map((entry) => (
                    <SessionRow
                      key={`rejected-${entry.sessionId}`}
                      sessionName={entry.sessionName}
                      slugs={entry.rejected}
                      icon={
                        <ShieldQuestion
                          className="size-3.5 text-muted-foreground"
                          aria-hidden={true}
                        />
                      }
                      onClear={
                        props.onClearSession
                          ? () => props.onClearSession?.(entry.sessionId)
                          : undefined
                      }
                    />
                  ))}
                </ul>
              </div>
            )}
            {props.onClearAll && (
              <div className="mt-2 flex justify-end">
                <Button variant="outline" size="sm" onClick={props.onClearAll} className="gap-1.5">
                  <RotateCcw className="size-3.5" aria-hidden={true} />
                  {t('settings.permissions.clearAll')}
                </Button>
              </div>
            )}
          </div>
        )}
      </StatusPanel>
    </div>
  );
}

interface SessionRowProps {
  readonly sessionName: string;
  readonly slugs: readonly string[];
  readonly icon: ReactNode;
  readonly onClear?: (() => void) | undefined;
}

function SessionRow({ sessionName, slugs, icon, onClear }: SessionRowProps): ReactNode {
  const { t } = useTranslate();
  return (
    <li className="flex items-center gap-3 rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-2">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{sessionName}</div>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {slugs.map((slug) => (
            <span
              key={slug}
              className="rounded-full bg-foreground/5 px-2 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {slug}
            </span>
          ))}
        </div>
      </div>
      {onClear && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          aria-label={t('settings.permissions.clearSession')}
          className="h-7 px-2 text-xs"
        >
          {t('settings.permissions.clearSession')}
        </Button>
      )}
    </li>
  );
}

interface ToolDecisionRowProps {
  readonly decision: ToolPermissionDecisionView;
  readonly onRevoke?: (toolName: string, argsHash: string) => void;
}

function ToolDecisionRow({ decision, onRevoke }: ToolDecisionRowProps): ReactNode {
  const { t } = useTranslate();
  return (
    <li className="flex items-center gap-3 rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-2">
      <Wrench className="size-3.5 shrink-0 text-muted-foreground" aria-hidden={true} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-medium">{decision.toolName}</span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {decision.argsHash.slice(0, 8)}…
          </span>
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
          {decision.argsPreview}
        </div>
      </div>
      {onRevoke && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRevoke(decision.toolName, decision.argsHash)}
          className="h-7 px-2 text-xs"
        >
          {t('settings.permissions.revoke')}
        </Button>
      )}
    </li>
  );
}

function EmptySourcePermissions(): ReactNode {
  const { t } = useTranslate();
  return (
    <p className="text-xs text-muted-foreground italic">
      {t('settings.permissions.sources.empty')}
    </p>
  );
}
