/**
 * Categorização de logs orientada ao significado em vez do nível
 * técnico (`trace/debug/info/warn/error/fatal`).
 *
 * Usuário leigo entende "Erros" e "IA & Agentes" — não entende
 * "warn" vs "error". Cada categoria carrega TranslationKey de label
 * + descrição. Mapeamento por nível mínimo + lista de prefixos de
 * `component`. Atualizar quando services novos forem adicionados.
 */

import type { LogStreamLine } from '@g4os/kernel/log-stream';
import type { TranslationKey } from '@g4os/ui';

export type LogCategoryId = 'all' | 'normal' | 'warnings' | 'errors' | 'agents' | 'data';

export interface LogCategory {
  readonly id: LogCategoryId;
  readonly labelKey: TranslationKey;
  readonly descriptionKey: TranslationKey;
  readonly icon: string;
}

export const LOG_CATEGORIES: readonly LogCategory[] = [
  {
    id: 'all',
    labelKey: 'debugHud.logCategory.all.label',
    descriptionKey: 'debugHud.logCategory.all.description',
    icon: '📋',
  },
  {
    id: 'normal',
    labelKey: 'debugHud.logCategory.normal.label',
    descriptionKey: 'debugHud.logCategory.normal.description',
    icon: '💬',
  },
  {
    id: 'warnings',
    labelKey: 'debugHud.logCategory.warnings.label',
    descriptionKey: 'debugHud.logCategory.warnings.description',
    icon: '⚠️',
  },
  {
    id: 'errors',
    labelKey: 'debugHud.logCategory.errors.label',
    descriptionKey: 'debugHud.logCategory.errors.description',
    icon: '🔴',
  },
  {
    id: 'agents',
    labelKey: 'debugHud.logCategory.agents.label',
    descriptionKey: 'debugHud.logCategory.agents.description',
    icon: '🤖',
  },
  {
    id: 'data',
    labelKey: 'debugHud.logCategory.data.label',
    descriptionKey: 'debugHud.logCategory.data.description',
    icon: '💾',
  },
];

const AGENT_COMPONENT_PREFIXES = [
  'claude',
  'openai',
  'google',
  'codex',
  'agent',
  'turn-dispatcher',
  'tool-loop',
  'turn-runner',
  'permission-broker',
];

const DATA_COMPONENT_PREFIXES = [
  'credential',
  'vault',
  'messages-service',
  'event-store',
  'event-reducer',
  'sessions-service',
  'projects-service',
  'sources-service',
  'sources-store',
  'db-service',
  'sqlite',
  'attachments',
  'backup',
];

function matchesAnyPrefix(component: string, prefixes: readonly string[]): boolean {
  const lower = component.toLowerCase();
  return prefixes.some((p) => lower.startsWith(p) || lower.includes(p));
}

export function lineMatchesCategory(line: LogStreamLine, category: LogCategoryId): boolean {
  switch (category) {
    case 'all':
      return true;
    case 'normal':
      return line.level === 'info' || line.level === 'debug' || line.level === 'trace';
    case 'warnings':
      return line.level === 'warn';
    case 'errors':
      return line.level === 'error' || line.level === 'fatal';
    case 'agents':
      return matchesAnyPrefix(line.component, AGENT_COMPONENT_PREFIXES);
    case 'data':
      return matchesAnyPrefix(line.component, DATA_COMPONENT_PREFIXES);
    default:
      return true;
  }
}
