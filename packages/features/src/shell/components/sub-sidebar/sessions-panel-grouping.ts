/**
 * Lógica de agrupamento de sessions por bucket de data — extraída de
 * `sessions-panel.tsx` para manter o componente abaixo do gate de 500 LOC.
 *
 * 4 buckets fixos têm `labelKey` (translation), meses passados têm `label`
 * literal via `toLocaleDateString` (locale-aware).
 */

import type { TranslationKey } from '@g4os/translate';
import type { SessionsPanelSessionItem } from './sessions-panel-types.ts';

export interface SessionGroup {
  readonly key: string;
  readonly labelKey?: TranslationKey;
  readonly label?: string;
  readonly items: readonly SessionsPanelSessionItem[];
}

const MS_PER_DAY = 86_400_000;

export function groupSessionsByDay(
  sessions: readonly SessionsPanelSessionItem[],
): readonly SessionGroup[] {
  const today = startOfDay(Date.now());
  const buckets = new Map<
    string,
    { labelKey?: TranslationKey; label?: string; items: SessionsPanelSessionItem[] }
  >();
  const order: string[] = [];

  for (const s of sessions) {
    const sortAt = s.sortAt ?? today;
    const dayStart = startOfDay(sortAt);
    const diffDays = Math.round((today - dayStart) / MS_PER_DAY);
    const resolved = resolveBucket(diffDays, dayStart);
    let bucket = buckets.get(resolved.key);
    if (!bucket) {
      bucket = {
        ...(resolved.labelKey ? { labelKey: resolved.labelKey } : {}),
        ...(resolved.label ? { label: resolved.label } : {}),
        items: [],
      };
      buckets.set(resolved.key, bucket);
      order.push(resolved.key);
    }
    bucket.items.push(s);
  }

  return order.map((key) => {
    const b = buckets.get(key);
    if (!b) return { key, label: key, items: [] };
    return {
      key,
      ...(b.labelKey ? { labelKey: b.labelKey } : {}),
      ...(b.label ? { label: b.label } : {}),
      items: b.items,
    };
  });
}

function resolveBucket(
  diffDays: number,
  dayStart: number,
): { key: string; labelKey?: TranslationKey; label?: string } {
  if (diffDays <= 0) return { key: 'today', labelKey: 'shell.sessionGroup.today' };
  if (diffDays === 1) return { key: 'yesterday', labelKey: 'shell.sessionGroup.yesterday' };
  if (diffDays < 7) return { key: 'this-week', labelKey: 'shell.sessionGroup.thisWeek' };
  if (diffDays < 30) return { key: 'this-month', labelKey: 'shell.sessionGroup.thisMonth' };
  const d = new Date(dayStart);
  const key = `${d.getFullYear()}-${d.getMonth()}`;
  const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return { key, label };
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
