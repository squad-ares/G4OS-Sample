/**
 * Agrupamento de sessões por tempo relativo ("Hoje" / "Ontem" / "Última
 * semana" / "Mais antigas"). Pinned sobem para um bucket próprio no topo.
 *
 * Puro, testável, sem dependência de React. Consumido pelo
 * `SessionList` para gerar os headers do virtualizer.
 */

import type { SessionDateGroup, SessionListItem } from '../types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface GroupSessionsOptions {
  readonly now?: number;
}

export function groupSessions(
  items: readonly SessionListItem[],
  options: GroupSessionsOptions = {},
): readonly SessionDateGroup[] {
  const now = options.now ?? Date.now();
  const startOfToday = getStartOfDay(now);
  const buckets = classifyItems(items, startOfToday);
  return buildGroups(buckets);
}

type Buckets = {
  readonly pinned: SessionListItem[];
  readonly today: SessionListItem[];
  readonly yesterday: SessionListItem[];
  readonly lastWeek: SessionListItem[];
  readonly older: SessionListItem[];
};

function classifyItems(items: readonly SessionListItem[], startOfToday: number): Buckets {
  const startOfYesterday = startOfToday - DAY_MS;
  const startOfLastWeek = startOfToday - 7 * DAY_MS;
  const buckets: Buckets = { pinned: [], today: [], yesterday: [], lastWeek: [], older: [] };
  for (const item of items) {
    if (item.pinnedAt !== undefined) {
      buckets.pinned.push(item);
      continue;
    }
    const anchor = item.lastMessageAt ?? item.updatedAt;
    if (anchor >= startOfToday) buckets.today.push(item);
    else if (anchor >= startOfYesterday) buckets.yesterday.push(item);
    else if (anchor >= startOfLastWeek) buckets.lastWeek.push(item);
    else buckets.older.push(item);
  }
  return buckets;
}

function buildGroups(buckets: Buckets): readonly SessionDateGroup[] {
  const groups: SessionDateGroup[] = [];
  if (buckets.pinned.length > 0)
    groups.push({ key: 'pinned', labelKey: 'session.group.pinned', items: buckets.pinned });
  if (buckets.today.length > 0)
    groups.push({ key: 'today', labelKey: 'session.group.today', items: buckets.today });
  if (buckets.yesterday.length > 0)
    groups.push({
      key: 'yesterday',
      labelKey: 'session.group.yesterday',
      items: buckets.yesterday,
    });
  if (buckets.lastWeek.length > 0)
    groups.push({ key: 'lastWeek', labelKey: 'session.group.lastWeek', items: buckets.lastWeek });
  if (buckets.older.length > 0)
    groups.push({ key: 'older', labelKey: 'session.group.older', items: buckets.older });
  return groups;
}

function getStartOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}
