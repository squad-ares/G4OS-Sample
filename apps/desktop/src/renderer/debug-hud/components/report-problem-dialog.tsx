/**
 * Modal "Reportar problema" — fluxo low-friction pra suporte.
 *
 * Fluxo:
 *   1. User abre o modal.
 *   2. Click em "Gerar diagnóstico" → roda `exportDiagnostic`,
 *      grava ZIP e popula a textarea com texto pré-formatado
 *      (versão, plataforma, caminho do ZIP).
 *   3. User adiciona descrição do problema.
 *   4. "Copiar tudo" → clipboard. User cola no canal de suporte.
 *
 * Sem `mailto:` hardcoded (no momento da implementação não há canal
 * formal definido); deixamos o user escolher onde mandar. Strings
 * todas via TranslationKey.
 */

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useTranslate,
} from '@g4os/ui';
import { Check, Copy, FileDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useAppMeta } from '../use-app-meta.ts';
import type { ActionResult, HudActions } from '../use-hud-actions.ts';

interface ReportProblemDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly actions: HudActions;
}

interface BuildReportInput {
  readonly description: string;
  readonly diagnosticPath: string | undefined;
  readonly appVersion: string;
  readonly platform: string;
  readonly t: (key: string, params?: Record<string, string | number>) => string;
}

function buildReport(input: BuildReportInput): string {
  const { description, diagnosticPath, appVersion, platform, t } = input;
  // F-CR31-9: cast simples (antes era `as never as never` redundante).
  const tk = (key: string, params?: Record<string, string | number>): string =>
    t(key as never, params);
  const lines = [
    tk('debugHud.report.template.problemTitle'),
    '',
    description.trim().length > 0 ? description : tk('debugHud.report.template.placeholder'),
    '',
    tk('debugHud.report.template.techInfoTitle'),
    tk('debugHud.report.template.appVersion', { value: appVersion }),
    tk('debugHud.report.template.platform', { value: platform }),
    tk('debugHud.report.template.date', { value: new Date().toLocaleString() }),
  ];
  if (diagnosticPath) {
    lines.push(tk('debugHud.report.template.diagAttached', { path: diagnosticPath }));
  }
  return lines.join('\n');
}

export function ReportProblemDialog({
  open,
  onOpenChange,
  actions,
}: ReportProblemDialogProps): ReactNode {
  const { t } = useTranslate();
  // F-CR31-11: meta vem do main via IPC; antes era hardcoded "0.0.0".
  const meta = useAppMeta();
  const [description, setDescription] = useState('');
  const [diagnosticPath, setDiagnosticPath] = useState<string | undefined>();
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reportText = buildReport({
    description,
    diagnosticPath,
    appVersion: meta.appVersion,
    platform: meta.platform,
    t: (key, params) => t(key as never, params),
  });

  const tMsg = (messageKey: string | undefined): string | null => {
    if (!messageKey) return null;
    return t(messageKey as never);
  };

  const handleExport = async (): Promise<void> => {
    setExporting(true);
    setExportStatus(null);
    const res: ActionResult = await actions.exportDiagnostic();
    setExporting(false);
    if (res.ok && res.path) {
      setDiagnosticPath(res.path);
      setExportStatus(t('debugHud.report.diagSuccess'));
    } else {
      setExportStatus(tMsg(res.messageKey) ?? t('debugHud.report.diagFail'));
    }
  };

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setExportStatus(t('debugHud.report.copyError'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('debugHud.report.title')}</DialogTitle>
          <DialogDescription>{t('debugHud.report.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="report-description" className="text-sm font-medium">
                {t('debugHud.report.descLabel')}
              </label>
              <span className="text-[10px] text-muted-foreground">
                {t('debugHud.report.charCount', { count: description.length })}
              </span>
            </div>
            <textarea
              id="report-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder={t('debugHud.report.descPlaceholder')}
              className="w-full rounded-md border border-foreground/10 bg-background/40 px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>

          <div className="rounded-md border border-foreground/10 bg-background/40 p-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t('debugHud.report.diagTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('debugHud.report.diagDesc')}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void handleExport()}
                disabled={exporting}
                className="shrink-0"
              >
                <FileDown className="size-3.5" />
                {exporting
                  ? t('debugHud.report.diagButton.generating')
                  : diagnosticPath
                    ? t('debugHud.report.diagButton.regenerate')
                    : t('debugHud.report.diagButton.generate')}
              </Button>
            </div>
            {diagnosticPath ? (
              <p className="text-[11px] text-emerald-500 break-all font-mono">✓ {diagnosticPath}</p>
            ) : null}
            {exportStatus ? (
              <p className="text-[11px] text-muted-foreground">{exportStatus}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium">{t('debugHud.report.previewLabel')}</p>
            <pre className="rounded-md border border-foreground/10 bg-background/40 p-3 text-[11px] font-mono whitespace-pre-wrap max-h-48 overflow-auto">
              {reportText}
            </pre>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('debugHud.report.close')}
          </Button>
          <Button type="button" onClick={() => void handleCopy()}>
            {copied ? (
              <>
                <Check className="size-4" />
                {t('debugHud.report.copied')}
              </>
            ) : (
              <>
                <Copy className="size-4" />
                {t('debugHud.report.copyAll')}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
