/**
 * Glossário de métricas do HUD via TranslationKey.
 *
 * Mapeia ID estável da métrica → par de chaves de tradução
 * (`titleKey`, `descriptionKey`). Renderer faz `t(...)` na renderização
 * — strings reais vivem em `@g4os/translate/locales/*.ts`.
 *
 * Lookup falha graciosamente: ID desconhecido retorna `undefined`,
 * caller pode degradar pra texto cru.
 */

import type { TranslationKey } from '@g4os/ui';

export interface MetricDefinition {
  readonly titleKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
}

// F-CR31-12: tipo `MetricId` é derivado do GLOSSARY pra que `<MetricLabel
// id="..." />` falhe em compile-time se a string não bate uma chave real.
// `satisfies` mantém literal types das chaves; `as const` em strings tornaria
// o objeto incompatível com `Record<string, ...>`.
export const GLOSSARY = {
  'memory.rss': {
    titleKey: 'debugHud.glossary.memoryRss.title',
    descriptionKey: 'debugHud.glossary.memoryRss.description',
  },
  'memory.heap-used': {
    titleKey: 'debugHud.glossary.memoryHeapUsed.title',
    descriptionKey: 'debugHud.glossary.memoryHeapUsed.description',
  },
  'memory.heap-total': {
    titleKey: 'debugHud.glossary.memoryHeapTotal.title',
    descriptionKey: 'debugHud.glossary.memoryHeapTotal.description',
  },
  'memory.external': {
    titleKey: 'debugHud.glossary.memoryExternal.title',
    descriptionKey: 'debugHud.glossary.memoryExternal.description',
  },
  'memory.growth': {
    titleKey: 'debugHud.glossary.memoryGrowth.title',
    descriptionKey: 'debugHud.glossary.memoryGrowth.description',
  },
  'sessions.active': {
    titleKey: 'debugHud.glossary.sessionsActive.title',
    descriptionKey: 'debugHud.glossary.sessionsActive.description',
  },
  'sessions.uptime': {
    titleKey: 'debugHud.glossary.sessionsUptime.title',
    descriptionKey: 'debugHud.glossary.sessionsUptime.description',
  },
  'sessions.turn-duration': {
    titleKey: 'debugHud.glossary.sessionsTurnDuration.title',
    descriptionKey: 'debugHud.glossary.sessionsTurnDuration.description',
  },
  'listeners.total': {
    titleKey: 'debugHud.glossary.listenersTotal.title',
    descriptionKey: 'debugHud.glossary.listenersTotal.description',
  },
  'listeners.stale': {
    titleKey: 'debugHud.glossary.listenersStale.title',
    descriptionKey: 'debugHud.glossary.listenersStale.description',
  },
  'ipc.req-per-sec': {
    titleKey: 'debugHud.glossary.ipcReqPerSec.title',
    descriptionKey: 'debugHud.glossary.ipcReqPerSec.description',
  },
  'ipc.p50': {
    titleKey: 'debugHud.glossary.ipcP50.title',
    descriptionKey: 'debugHud.glossary.ipcP50.description',
  },
  'ipc.p95': {
    titleKey: 'debugHud.glossary.ipcP95.title',
    descriptionKey: 'debugHud.glossary.ipcP95.description',
  },
  'ipc.error-rate': {
    titleKey: 'debugHud.glossary.ipcErrorRate.title',
    descriptionKey: 'debugHud.glossary.ipcErrorRate.description',
  },
  'ipc.error-count': {
    titleKey: 'debugHud.glossary.ipcErrorCount.title',
    descriptionKey: 'debugHud.glossary.ipcErrorCount.description',
  },
  'ipc.procedures': {
    titleKey: 'debugHud.glossary.ipcProcedures.title',
    descriptionKey: 'debugHud.glossary.ipcProcedures.description',
  },
  'vault.ops': {
    titleKey: 'debugHud.glossary.vaultOps.title',
    descriptionKey: 'debugHud.glossary.vaultOps.description',
  },
  'vault.errors': {
    titleKey: 'debugHud.glossary.vaultErrors.title',
    descriptionKey: 'debugHud.glossary.vaultErrors.description',
  },
  'vault.error-rate': {
    titleKey: 'debugHud.glossary.vaultErrorRate.title',
    descriptionKey: 'debugHud.glossary.vaultErrorRate.description',
  },
  'logs.recent': {
    titleKey: 'debugHud.glossary.logsRecent.title',
    descriptionKey: 'debugHud.glossary.logsRecent.description',
  },
  'logs.total-seen': {
    titleKey: 'debugHud.glossary.logsTotalSeen.title',
    descriptionKey: 'debugHud.glossary.logsTotalSeen.description',
  },
  'health.score': {
    titleKey: 'debugHud.glossary.healthScore.title',
    descriptionKey: 'debugHud.glossary.healthScore.description',
  },
} satisfies Record<string, MetricDefinition>;

export type MetricId = keyof typeof GLOSSARY;
