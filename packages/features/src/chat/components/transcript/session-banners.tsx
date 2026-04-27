import { cn, useTranslate } from '@g4os/ui';
import { AlertTriangle, Clock, Info, ShieldQuestion, X } from 'lucide-react';
import type { ComponentType, ReactNode, SVGProps } from 'react';

export type SessionBannerSeverity = 'info' | 'warning' | 'error' | 'permission';

export interface SessionBannerAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface SessionBanner {
  readonly id: string;
  readonly severity: SessionBannerSeverity;
  readonly message: ReactNode;
  readonly action?: SessionBannerAction;
  readonly onDismiss?: () => void;
}

export interface SessionBannersProps {
  readonly banners: ReadonlyArray<SessionBanner>;
}

/**
 * Renderiza um stack de banners (info/warning/error/permission) acima
 * do transcript. Cada banner pode ter ação primária e dismiss opcional;
 * dismiss só aparece quando `onDismiss` é provido. Vazio quando não há
 * banners — não ocupa espaço.
 */
export function SessionBanners({ banners }: SessionBannersProps) {
  if (banners.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-col">
      {banners.map((banner) => (
        <BannerRow key={banner.id} banner={banner} />
      ))}
    </div>
  );
}

interface BannerRowProps {
  readonly banner: SessionBanner;
}

function BannerRow({ banner }: BannerRowProps) {
  const { t } = useTranslate();
  const Icon = severityIcon(banner.severity);
  return (
    <div
      role={banner.severity === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex shrink-0 items-center gap-3 border-b px-4 py-2 text-[12px] font-medium',
        severityClasses(banner.severity),
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden={true} />
      <span className="flex-1 truncate">{banner.message}</span>
      {banner.action ? (
        <button
          type="button"
          onClick={banner.action.onClick}
          className="rounded-full border border-current/40 bg-current/10 px-2.5 py-0.5 text-[11px] font-semibold transition-colors hover:bg-current/20"
        >
          {banner.action.label}
        </button>
      ) : null}
      {banner.onDismiss ? (
        <button
          type="button"
          onClick={banner.onDismiss}
          aria-label={t('chat.banners.dismiss')}
          className="rounded-md p-0.5 transition-colors hover:bg-current/20"
        >
          <X className="size-3.5" aria-hidden={true} />
        </button>
      ) : null}
    </div>
  );
}

function severityClasses(severity: SessionBannerSeverity): string {
  switch (severity) {
    case 'info':
      return 'border-accent/30 bg-accent/10 text-accent';
    case 'warning':
      return 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400';
    case 'error':
      return 'border-destructive/30 bg-destructive/10 text-destructive';
    case 'permission':
      return 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400';
  }
}

function severityIcon(severity: SessionBannerSeverity): ComponentType<SVGProps<SVGSVGElement>> {
  switch (severity) {
    case 'info':
      return Info;
    case 'warning':
      return AlertTriangle;
    case 'error':
      return AlertTriangle;
    case 'permission':
      return ShieldQuestion;
  }
}

/** Helper para construir banner de runtime pendente (chave faltando). */
export function buildRuntimePendingBanner(
  message: ReactNode,
  configureAction: SessionBannerAction,
): SessionBanner {
  return {
    id: 'runtime-pending',
    severity: 'info',
    message,
    action: configureAction,
  };
}

/** Helper para banner de awaiting permission. */
export function buildPermissionPendingBanner(toolName: string, message: ReactNode): SessionBanner {
  return {
    id: `permission:${toolName}`,
    severity: 'permission',
    message,
  };
}

/** Helper para banner de erro de turn. */
export function buildErrorBanner(
  id: string,
  message: ReactNode,
  retryAction?: SessionBannerAction,
  onDismiss?: () => void,
): SessionBanner {
  const banner: SessionBanner = { id, severity: 'error', message };
  if (retryAction) (banner as { action?: SessionBannerAction }).action = retryAction;
  if (onDismiss) (banner as { onDismiss?: () => void }).onDismiss = onDismiss;
  return banner;
}

/** Helper para banner de context-window warning. */
export function buildContextWarningBanner(
  level: 'mid' | 'high',
  message: ReactNode,
  onDismiss?: () => void,
): SessionBanner {
  const banner: SessionBanner = {
    id: 'context-warning',
    severity: level === 'high' ? 'warning' : 'info',
    message,
  };
  if (onDismiss) (banner as { onDismiss?: () => void }).onDismiss = onDismiss;
  return banner;
}

/** Helper para banner de status (e.g. 'Aguardando primeiro evento...'). */
export function buildStatusBanner(id: string, message: ReactNode): SessionBanner {
  return {
    id,
    severity: 'info',
    message: (
      <span className="flex items-center gap-1.5">
        <Clock className="size-3" aria-hidden={true} />
        {message}
      </span>
    ),
  };
}
