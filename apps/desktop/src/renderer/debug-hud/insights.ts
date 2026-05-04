/**
 * Camada de interpretação do HUD: traduz números crus em diagnósticos
 * acionáveis para usuários não-técnicos.
 *
 * Cada `Insight` carrega `titleKey/descriptionKey` (TranslationKey) +
 * `params` opcionais para interpolação. Renderer faz `t(key, params)`
 * na renderização — strings reais vivem em `@g4os/translate/locales`.
 *
 * Lógica é pura (sem React, sem IPC) — facilita teste e mantém o
 * componente de UI focado em renderização.
 */

import type { TranslationKey } from '@g4os/ui';
import type { HudSnapshot } from '../../debug-hud-types.ts';

export type InsightSeverity = 'info' | 'warn' | 'critical';

export type InsightActionKind =
  | 'force-gc'
  | 'reload-renderer'
  | 'reset-listeners'
  | 'cancel-all-turns'
  | 'export-diagnostic';

export interface InsightAction {
  readonly kind: InsightActionKind;
  readonly labelKey: TranslationKey;
}

export interface Insight {
  readonly id: string;
  readonly severity: InsightSeverity;
  readonly titleKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  readonly params?: Record<string, string | number>;
  readonly action?: InsightAction;
}

const MB = 1_048_576;
const GROWTH_WARN_MB_PER_MIN = 2;
const GROWTH_CRITICAL_MB_PER_MIN = 5;
const RSS_WARN_MB = 800;
const RSS_CRITICAL_MB = 1500;
const LISTENERS_WARN = 50;
const LISTENERS_CRITICAL = 100;
const IPC_LATENCY_WARN_MS = 1000;
const IPC_LATENCY_CRITICAL_MS = 2500;
const IPC_ERROR_RATE_WARN = 0.05;
const VAULT_ERROR_RATE_WARN = 0.05;
const TURN_STUCK_WARN_MS = 60_000;

function growthMBperMin(bytesPerSec: number): number {
  return (bytesPerSec * 60) / MB;
}

function bytesToMB(bytes: number): number {
  return Math.round(bytes / MB);
}

export function deriveInsights(snapshot: HudSnapshot): readonly Insight[] {
  const insights: Insight[] = [];
  const now = snapshot.ts;

  // Memória — leak vs alocação alta.
  const growth = growthMBperMin(snapshot.memory.growthRateBytesPerSec);
  if (growth > GROWTH_CRITICAL_MB_PER_MIN) {
    insights.push({
      id: 'memory-growth-critical',
      severity: 'critical',
      titleKey: 'debugHud.insight.memoryGrowthCritical.title',
      descriptionKey: 'debugHud.insight.memoryGrowthCritical.description',
      params: { growth: growth.toFixed(1) },
      action: {
        kind: 'reload-renderer',
        labelKey: 'debugHud.insight.memoryGrowthCritical.action',
      },
    });
  } else if (growth > GROWTH_WARN_MB_PER_MIN) {
    insights.push({
      id: 'memory-growth-warn',
      severity: 'warn',
      titleKey: 'debugHud.insight.memoryGrowthWarn.title',
      descriptionKey: 'debugHud.insight.memoryGrowthWarn.description',
      params: { growth: growth.toFixed(1) },
      action: { kind: 'force-gc', labelKey: 'debugHud.insight.memoryGrowthWarn.action' },
    });
  }

  const rssMB = bytesToMB(snapshot.memory.current.rss);
  if (rssMB > RSS_CRITICAL_MB) {
    insights.push({
      id: 'memory-rss-critical',
      severity: 'critical',
      titleKey: 'debugHud.insight.memoryRssCritical.title',
      descriptionKey: 'debugHud.insight.memoryRssCritical.description',
      params: { rss: rssMB },
      action: {
        kind: 'export-diagnostic',
        labelKey: 'debugHud.insight.memoryRssCritical.action',
      },
    });
  } else if (rssMB > RSS_WARN_MB) {
    insights.push({
      id: 'memory-rss-warn',
      severity: 'warn',
      titleKey: 'debugHud.insight.memoryRssWarn.title',
      descriptionKey: 'debugHud.insight.memoryRssWarn.description',
      params: { rss: rssMB },
    });
  }

  // Listeners — leak detector reportando handlers órfãos.
  if (snapshot.listeners.stale.length > 0) {
    insights.push({
      id: 'listeners-stale',
      severity: 'critical',
      titleKey: 'debugHud.insight.listenersStale.title',
      descriptionKey: 'debugHud.insight.listenersStale.description',
      params: { count: snapshot.listeners.stale.length },
      action: { kind: 'reset-listeners', labelKey: 'debugHud.insight.listenersStale.action' },
    });
  } else if (snapshot.listeners.total > LISTENERS_CRITICAL) {
    insights.push({
      id: 'listeners-many-critical',
      severity: 'critical',
      titleKey: 'debugHud.insight.listenersManyCritical.title',
      descriptionKey: 'debugHud.insight.listenersManyCritical.description',
      params: { total: snapshot.listeners.total },
      action: {
        kind: 'export-diagnostic',
        labelKey: 'debugHud.insight.listenersManyCritical.action',
      },
    });
  } else if (snapshot.listeners.total > LISTENERS_WARN) {
    insights.push({
      id: 'listeners-many-warn',
      severity: 'warn',
      titleKey: 'debugHud.insight.listenersManyWarn.title',
      descriptionKey: 'debugHud.insight.listenersManyWarn.description',
      params: { total: snapshot.listeners.total },
    });
  }

  // IPC — latência ou erro.
  if (snapshot.ipc.totalCount > 0) {
    if (snapshot.ipc.errorRate > IPC_ERROR_RATE_WARN) {
      insights.push({
        id: 'ipc-error-rate',
        severity: 'critical',
        titleKey: 'debugHud.insight.ipcErrorRate.title',
        descriptionKey: 'debugHud.insight.ipcErrorRate.description',
        params: { pct: (snapshot.ipc.errorRate * 100).toFixed(1) },
      });
    }
    if (snapshot.ipc.p95Ms > IPC_LATENCY_CRITICAL_MS) {
      insights.push({
        id: 'ipc-latency-critical',
        severity: 'critical',
        titleKey: 'debugHud.insight.ipcLatencyCritical.title',
        descriptionKey: 'debugHud.insight.ipcLatencyCritical.description',
        params: { p95: snapshot.ipc.p95Ms.toFixed(0) },
      });
    } else if (snapshot.ipc.p95Ms > IPC_LATENCY_WARN_MS) {
      insights.push({
        id: 'ipc-latency-warn',
        severity: 'warn',
        titleKey: 'debugHud.insight.ipcLatencyWarn.title',
        descriptionKey: 'debugHud.insight.ipcLatencyWarn.description',
        params: { p95: snapshot.ipc.p95Ms.toFixed(0) },
      });
    }
  }

  // Vault — erros de acesso a credenciais.
  if (snapshot.vault.counts60s.ops > 0) {
    const errorRate = snapshot.vault.counts60s.errors / snapshot.vault.counts60s.ops;
    if (errorRate > VAULT_ERROR_RATE_WARN) {
      insights.push({
        id: 'vault-errors',
        severity: 'critical',
        titleKey: 'debugHud.insight.vaultErrors.title',
        descriptionKey: 'debugHud.insight.vaultErrors.description',
        params: { count: snapshot.vault.counts60s.errors },
      });
    }
  }

  // Turnos travados — startedAt antigo demais.
  const stuckTurns = snapshot.sessions.active.filter((t) => now - t.startedAt > TURN_STUCK_WARN_MS);
  if (stuckTurns.length > 0) {
    insights.push({
      id: 'turns-stuck',
      severity: 'warn',
      titleKey: 'debugHud.insight.turnsStuck.title',
      descriptionKey: 'debugHud.insight.turnsStuck.description',
      params: { count: stuckTurns.length },
      action: { kind: 'cancel-all-turns', labelKey: 'debugHud.insight.turnsStuck.action' },
    });
  }

  return insights;
}
