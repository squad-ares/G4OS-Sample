import { StatusPanel, useTranslate } from '@g4os/ui';
import { ExternalLink, Github, LifeBuoy, Mail } from 'lucide-react';
import type { ReactNode } from 'react';

export interface SupportCategoryProps {
  /** Info do build atual (vem de `trpc.platform.getAppInfo`). */
  readonly info: SupportAppInfoView | null;
  /** Copia fingerprint formatado (versão + platform + electron + node) pro clipboard. */
  readonly onCopyFingerprint: () => void;
  /** Abre URL externa via `trpc.platform.openExternal`. */
  readonly onOpenExternal: (url: string) => void;
}

export interface SupportAppInfoView {
  readonly version: string;
  readonly platform: string;
  readonly isPackaged: boolean;
  readonly electronVersion: string;
  readonly nodeVersion: string;
}

/**
 * Hub estático de suporte: links externos pra docs/feedback/repo + bloco
 * de fingerprint copiável que ajuda em tickets de suporte. V1 tinha 897
 * LOC com hub de ajuda interno (FAQ + atalhos in-app); V2 mantém slice
 * mínimo até decisão de produto sobre help-center embarcado.
 */
export function SupportCategory({
  info,
  onCopyFingerprint,
  onOpenExternal,
}: SupportCategoryProps): ReactNode {
  const { t } = useTranslate();

  return (
    <div className="flex flex-col gap-4">
      <StatusPanel
        title={t('settings.support.fingerprint.title')}
        description={t('settings.support.fingerprint.description')}
        badge={t('settings.category.support.label')}
      >
        {info ? (
          <div className="flex flex-col gap-3">
            <pre className="overflow-x-auto rounded-md border border-foreground/10 bg-foreground/[0.03] p-3 font-mono text-xs leading-relaxed">
              {formatFingerprint(info)}
            </pre>
            <div>
              <button
                type="button"
                onClick={onCopyFingerprint}
                className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition hover:bg-accent"
              >
                {t('settings.support.fingerprint.copy')}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('settings.support.fingerprint.loading')}
          </p>
        )}
      </StatusPanel>

      <StatusPanel
        title={t('settings.support.docs.title')}
        description={t('settings.support.docs.description')}
      >
        <LinkRow
          icon={<LifeBuoy className="size-4" aria-hidden={true} />}
          label={t('settings.support.docs.linkLabel')}
          url="https://g4oscloud.com/docs"
          onOpen={onOpenExternal}
        />
      </StatusPanel>

      <StatusPanel
        title={t('settings.support.feedback.title')}
        description={t('settings.support.feedback.description')}
      >
        <div className="flex flex-col gap-2">
          <LinkRow
            icon={<Github className="size-4" aria-hidden={true} />}
            label={t('settings.support.feedback.issuesLabel')}
            url="https://github.com/dreamsquad/g4os/issues/new"
            onOpen={onOpenExternal}
          />
          <LinkRow
            icon={<Mail className="size-4" aria-hidden={true} />}
            label={t('settings.support.feedback.emailLabel')}
            url="mailto:support@g4oscloud.com"
            onOpen={onOpenExternal}
          />
        </div>
      </StatusPanel>
    </div>
  );
}

interface LinkRowProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly url: string;
  readonly onOpen: (url: string) => void;
}

function LinkRow({ icon, label, url, onOpen }: LinkRowProps): ReactNode {
  return (
    <button
      type="button"
      onClick={() => onOpen(url)}
      className="group flex w-full items-center justify-between gap-3 rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-2.5 text-left transition-colors hover:bg-accent/12"
    >
      <span className="flex min-w-0 items-center gap-3 text-sm">
        <span className="text-muted-foreground transition-colors group-hover:text-foreground">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <ExternalLink
        className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
        aria-hidden={true}
      />
    </button>
  );
}

function formatFingerprint(info: SupportAppInfoView): string {
  return [
    `version:    ${info.version}`,
    `channel:    ${info.isPackaged ? 'stable' : 'dev'}`,
    `platform:   ${info.platform}`,
    `electron:   ${info.electronVersion || '—'}`,
    `node:       ${info.nodeVersion || '—'}`,
  ].join('\n');
}
