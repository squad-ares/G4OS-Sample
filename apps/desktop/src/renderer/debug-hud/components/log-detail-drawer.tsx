/**
 * Drawer/modal de detalhes de uma log line — resolve a dor de scroll
 * horizontal: na lista, cada linha é truncada com ellipsis. Click abre
 * este painel com formatação completa: timestamp, level, component,
 * mensagem em pre-wrap, e `ctx` em árvore key-value.
 *
 * Implementado via `Dialog` (modal central) — escolhido em vez de
 * `Drawer` lateral pra evitar competir com o ScrollArea da lista de logs
 * no eixo horizontal.
 */

import type { LogStreamLine } from '@g4os/kernel/log-stream';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  useTranslate,
} from '@g4os/ui';
import { fmtTime } from '../format.ts';

interface LogDetailDrawerProps {
  readonly line: LogStreamLine | null;
  readonly onClose: () => void;
}

const LEVEL_COLOR: Record<string, string> = {
  trace: 'text-muted-foreground',
  debug: 'text-muted-foreground',
  info: 'text-sky-500',
  warn: 'text-amber-500',
  error: 'text-rose-500',
  fatal: 'text-rose-600',
};

function CtxTree({ ctx }: { ctx: Record<string, unknown> }) {
  const entries = Object.entries(ctx);
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1.5 font-mono text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[140px_1fr] gap-3 items-start">
          <span className="text-muted-foreground truncate">{key}</span>
          <span className="break-all whitespace-pre-wrap">
            {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function LogDetailDrawer({ line, onClose }: LogDetailDrawerProps) {
  const { t } = useTranslate();
  return (
    <Dialog open={line !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">{t('debugHud.logDetail.title')}</DialogTitle>
        </DialogHeader>
        {line ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">{fmtTime(line.time)}</span>
              <span
                className={`font-semibold uppercase ${LEVEL_COLOR[line.level] ?? 'text-foreground'}`}
              >
                {line.level}
              </span>
              <span className="rounded bg-foreground/5 px-2 py-0.5 font-mono">
                {line.component}
              </span>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('debugHud.logDetail.message')}
              </div>
              <p className="rounded-md border border-foreground/10 bg-background/40 p-3 text-sm leading-relaxed whitespace-pre-wrap break-words font-mono">
                {line.msg}
              </p>
            </div>
            {line.ctx && Object.keys(line.ctx).length > 0 ? (
              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t('debugHud.logDetail.context')}
                </div>
                <ScrollArea className="max-h-[40vh] rounded-md border border-foreground/10 bg-background/40 p-3">
                  <CtxTree ctx={line.ctx as Record<string, unknown>} />
                </ScrollArea>
              </div>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
