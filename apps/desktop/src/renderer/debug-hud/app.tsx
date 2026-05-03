/**
 * Orquestrador do Debug HUD: header com status agregado +
 * tab navigation entre Visão Geral / Memória / IPC / Logs / Vault.
 *
 * Cada tab vive em seu próprio arquivo (`components/tab-*.tsx`) e
 * recebe slice do snapshot. Estado é mínimo aqui: tab ativa + toast
 * inline de feedback de ação. Strings via `useTranslate()`.
 */

import {
  ScrollArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TooltipProvider,
  type TranslationKey,
  useTranslate,
} from '@g4os/ui';
import { CheckCircle2, XCircle } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { HudHeader } from './components/header.tsx';
import { TabIpc } from './components/tab-ipc.tsx';
import { TabLogs } from './components/tab-logs.tsx';
import { TabMemory } from './components/tab-memory.tsx';
import { TabOverview } from './components/tab-overview.tsx';
import { TabVault } from './components/tab-vault.tsx';
import { computeHealthScore } from './health-score.ts';
import { deriveInsights, type InsightActionKind } from './insights.ts';
import { useHudActions } from './use-hud-actions.ts';
import { useHudSnapshot } from './use-hud-snapshot.ts';

type TabId = 'overview' | 'memory' | 'ipc' | 'logs' | 'vault';

interface ToastState {
  readonly label: string;
  readonly ok: boolean;
  readonly message: string | undefined;
}

function ActionToast({
  toast,
  onDismiss,
}: {
  toast: ToastState;
  onDismiss: () => void;
}): ReactNode {
  // F-CR31-1: deps deve ser apenas `[toast]`. Antes incluía `onDismiss`,
  // recriado a cada render do parent (App re-renderiza 1Hz com snapshot
  // novo) — `clearTimeout`/`setTimeout` ressetava antes de chegar nos
  // 2000ms, toast nunca dismissava. Agora cleanup chama o `onDismiss`
  // corrente via closure capture, mas o effect só re-roda quando o
  // toast troca de identidade.
  // biome-ignore lint/correctness/useExhaustiveDependencies: F-CR31-1
  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.ok ? 2000 : 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const Icon = toast.ok ? CheckCircle2 : XCircle;
  const iconColor = toast.ok ? 'text-emerald-500' : 'text-rose-500';
  const borderColor = toast.ok ? 'border-emerald-500/30' : 'border-rose-500/30';
  const bg = toast.ok ? 'bg-emerald-500/8' : 'bg-rose-500/8';

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-start gap-2 rounded-lg border ${borderColor} ${bg} px-3 py-2 shadow-lg max-w-sm`}
      role="status"
      aria-live="polite"
    >
      <Icon className={`size-4 shrink-0 mt-0.5 ${iconColor}`} aria-hidden={true} />
      <div className="min-w-0">
        <p className="text-xs font-medium">{toast.label}</p>
        {toast.message ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground break-words">{toast.message}</p>
        ) : null}
      </div>
    </div>
  );
}

// `t()` aceita TranslationKey tipada; messageKey vem como string opaca do
// main process (handlers em `actions.ts` retornam keys constantes
// documentadas — contrato mantido manualmente). Cast unsafe encapsulado
// num único helper.
type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

function tMessageKey(
  t: Translate,
  messageKey: string | undefined,
  params: Record<string, string | number> | undefined,
): string | undefined {
  if (!messageKey) return undefined;
  return t(messageKey as TranslationKey, params);
}

export function App(): ReactNode {
  const snapshot = useHudSnapshot();
  const { t } = useTranslate();
  const actions = useHudActions();
  const [tab, setTab] = useState<TabId>('overview');
  const [toast, setToast] = useState<ToastState | null>(null);

  const showResult = (
    label: string,
    ok: boolean,
    messageKey?: string,
    params?: Record<string, string | number>,
  ): void => {
    setToast({ label, ok, message: tMessageKey(t, messageKey, params) });
  };

  const handleInsightAction = (kind: InsightActionKind, label: string): void => {
    const fn =
      kind === 'force-gc'
        ? actions.forceGc
        : kind === 'reload-renderer'
          ? actions.reloadRenderer
          : kind === 'reset-listeners'
            ? actions.resetListeners
            : kind === 'cancel-all-turns'
              ? actions.cancelAllTurns
              : actions.exportDiagnostic;
    void fn().then((res) => showResult(label, res.ok, res.messageKey, res.params));
  };

  if (!snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        {t('debugHud.app.waiting')}
      </div>
    );
  }

  const insights = deriveInsights(snapshot);
  const healthScore = computeHealthScore(insights);
  const uptimeMs = snapshot.processTree.nodes[0]?.uptimeMs ?? 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <HudHeader
          uptimeMs={uptimeMs}
          insights={insights}
          healthScore={healthScore}
          actions={actions}
          onActionResult={showResult}
        />
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as TabId)}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="mx-4 mt-3 self-start">
            <TabsTrigger value="overview">{t('debugHud.tab.overview')}</TabsTrigger>
            <TabsTrigger value="memory">{t('debugHud.tab.memory')}</TabsTrigger>
            <TabsTrigger value="ipc">
              {t('debugHud.tab.ipc')}
              {snapshot.sessions.activeCount > 0 ? (
                <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 text-[10px] tabular-nums">
                  {snapshot.sessions.activeCount}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="logs">
              {t('debugHud.tab.logs')}
              {snapshot.logs.recent.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-foreground/10 px-1.5 text-[10px] tabular-nums">
                  {snapshot.logs.recent.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="vault">{t('debugHud.tab.vault')}</TabsTrigger>
          </TabsList>
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-4 py-4">
              <TabsContent value="overview" className="mt-0">
                <TabOverview
                  snapshot={snapshot}
                  insights={insights}
                  onInsightAction={handleInsightAction}
                  onNavigate={setTab}
                />
              </TabsContent>
              <TabsContent value="memory" className="mt-0">
                <TabMemory
                  memory={snapshot.memory}
                  processTree={snapshot.processTree}
                  actions={actions}
                  onActionResult={showResult}
                />
              </TabsContent>
              <TabsContent value="ipc" className="mt-0">
                <TabIpc
                  ipc={snapshot.ipc}
                  sessions={snapshot.sessions}
                  listeners={snapshot.listeners}
                  actions={actions}
                  onActionResult={showResult}
                />
              </TabsContent>
              <TabsContent value="logs" className="mt-0 h-[calc(100vh-180px)]">
                <TabLogs
                  logs={snapshot.logs}
                  onClearLogs={() => {
                    void actions
                      .clearLogs()
                      .then((res) =>
                        showResult(
                          t('debugHud.tabLogs.clearHistory'),
                          res.ok,
                          res.messageKey,
                          res.params,
                        ),
                      );
                  }}
                />
              </TabsContent>
              <TabsContent value="vault" className="mt-0">
                <TabVault vault={snapshot.vault} />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
        {toast ? <ActionToast toast={toast} onDismiss={() => setToast(null)} /> : null}
      </div>
    </TooltipProvider>
  );
}
