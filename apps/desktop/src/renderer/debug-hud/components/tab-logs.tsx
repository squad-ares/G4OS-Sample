/**
 * Tab "Logs" — lista virtualizada do ring buffer (até 1000 linhas).
 *
 * Filtro principal por categoria semântica (Atividade normal, Avisos,
 * Erros, IA & Agentes, Dados & Credenciais) — substitui o select de
 * level técnico (`trace/debug/info/warn/error/fatal`) pra usuário leigo.
 *
 * Click numa linha abre `LogDetailDrawer` com formatação completa
 * (msg em pre-wrap + ctx em árvore key-value). Resolve scroll horizontal.
 * Strings via TranslationKey.
 */

import type { LogStreamLine } from '@g4os/kernel/log-stream';
import { Button, Input, ScrollArea, useTranslate } from '@g4os/ui';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Eraser, Search, X } from 'lucide-react';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import type { LogsSnapshot } from '../../../debug-hud-types.ts';
import { fmtTime } from '../format.ts';
import { LOG_CATEGORIES, type LogCategoryId, lineMatchesCategory } from '../log-categories.ts';
import { LogDetailDrawer } from './log-detail-drawer.tsx';

const LEVEL_COLOR: Record<string, string> = {
  trace: 'text-muted-foreground/70',
  debug: 'text-muted-foreground',
  info: 'text-foreground',
  warn: 'text-amber-500',
  error: 'text-rose-500',
  fatal: 'text-rose-600',
};

interface TabLogsProps {
  readonly logs: LogsSnapshot;
  readonly onClearLogs: () => void;
}

export function TabLogs({ logs, onClearLogs }: TabLogsProps): ReactNode {
  const { t } = useTranslate();
  const [category, setCategory] = useState<LogCategoryId>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<LogStreamLine | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    return logs.recent.filter((line) => {
      if (!lineMatchesCategory(line, category)) return false;
      if (query.length > 0) {
        const text = `${line.component} ${line.msg}`.toLowerCase();
        if (!text.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [logs.recent, category, query]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 12,
  });

  const isEmpty = filtered.length === 0;
  const hasFilter = query.length > 0 || category !== 'all';
  const activeCategory = LOG_CATEGORIES.find((c) => c.id === category);

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {LOG_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategory(cat.id)}
            title={t(cat.descriptionKey)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
              category === cat.id
                ? 'bg-accent/15 border-accent/40 text-foreground'
                : 'bg-background/40 border-foreground/10 text-muted-foreground hover:text-foreground'
            }`}
          >
            <span aria-hidden={true}>{cat.icon}</span>
            {t(cat.labelKey)}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden={true}
          />
          <Input
            type="text"
            placeholder={t('debugHud.tabLogs.search.placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 pl-8 pr-8 text-xs"
          />
          {query.length > 0 ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={t('debugHud.tabLogs.search.clear')}
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
          {filtered.length} / {logs.recent.length}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearLogs}
          className="h-8 gap-1.5 text-xs"
          title={t('debugHud.tabLogs.clearHistory.tooltip')}
        >
          <Eraser className="size-3.5" />
          {t('debugHud.tabLogs.clearHistory')}
        </Button>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>
          {activeCategory ? t(activeCategory.descriptionKey) : t('debugHud.tabLogs.selectCategory')}
        </span>
        <span>{t('debugHud.tabLogs.summary', { seen: logs.totalSeen.toLocaleString() })}</span>
      </div>

      <div className="flex-1 min-h-0 rounded-lg border border-foreground/10 bg-background/40 overflow-hidden">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center gap-1 py-12 text-center text-xs text-muted-foreground">
            {logs.recent.length === 0 ? (
              <>
                <span>{t('debugHud.tabLogs.empty.waiting')}</span>
                <span className="text-[10px]">{t('debugHud.tabLogs.empty.waitingHint')}</span>
              </>
            ) : (
              <>
                <span>{t('debugHud.tabLogs.empty.noMatch')}</span>
                {hasFilter ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setCategory('all');
                    }}
                    className="text-[10px] underline hover:text-foreground"
                  >
                    {t('debugHud.tabLogs.empty.clearFilters')}
                  </button>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div ref={parentRef} className="h-full overflow-auto">
              <div
                style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}
                className="font-mono text-[11px]"
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const line = filtered[virtualRow.index];
                  if (!line) return null;
                  return (
                    <button
                      key={virtualRow.key}
                      type="button"
                      onClick={() => setSelected(line)}
                      className="absolute inset-x-0 flex items-center gap-2 px-3 py-1 text-left hover:bg-accent/12 focus:outline-none focus:bg-accent/15"
                      style={{
                        transform: `translateY(${virtualRow.start}px)`,
                        height: `${virtualRow.size}px`,
                      }}
                    >
                      <span className="text-muted-foreground tabular-nums shrink-0">
                        {fmtTime(line.time)}
                      </span>
                      <span
                        className={`font-semibold uppercase shrink-0 w-10 ${LEVEL_COLOR[line.level] ?? 'text-foreground'}`}
                      >
                        {line.level}
                      </span>
                      <span className="text-muted-foreground shrink-0 max-w-[180px] truncate">
                        [{line.component}]
                      </span>
                      <span className="flex-1 min-w-0 truncate">{line.msg}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
      <LogDetailDrawer line={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
