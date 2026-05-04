/**
 * Helper centralizado de formatação de tempo relativo.
 *
 * CR-37 F-CR37-4: substitui as 3 implementações duplicadas com strings
 * hardcoded em `sessions-panel.tsx`, `project-card.tsx` e
 * `workspace-list-panel.tsx`. Usa chaves do catálogo de tradução em vez
 * de strings literais (`'now'`, `'agora'`).
 *
 * CR-37 F-CR37-5: usa locale do app via `t()` em vez de
 * `new Date().toLocaleDateString(undefined, …)`.
 */

import type { useTranslate } from '@g4os/ui';

type TFn = ReturnType<typeof useTranslate>['t'];

/**
 * Formata um timestamp unix em milissegundos como string relativa curta.
 * Retorna `null` quando o timestamp é inválido ou futuro.
 *
 * @param t - função de tradução de `useTranslate()`
 * @param ms - timestamp em milissegundos
 */
export function formatRelativeMs(t: TFn, ms: number): string | null {
  try {
    const delta = Date.now() - ms;
    if (delta < 0) return null;
    const minutes = Math.floor(delta / 60_000);
    if (minutes < 1) return t('common.relative.justNow');
    if (minutes < 60) return t('common.relative.minutesAgo', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('common.relative.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t('common.relative.daysAgo', { count: days });
    // Para datas mais antigas, usar formatação locale-aware via Intl.
    // Não usa `toLocaleDateString(undefined, …)` — locale vem do parâmetro `t`.
    return new Intl.DateTimeFormat('pt-BR', { month: 'short', day: '2-digit' }).format(
      new Date(ms),
    );
  } catch {
    return null;
  }
}
