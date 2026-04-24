/**
 * Helpers puxados de `TurnDispatcher` pra manter o dispatcher ≤300 LOC:
 *   - `buildSourcePlan()` — roda `SourcePlanner.planTurn()` com fallback
 *     safe-empty se store/session falharem.
 *   - `composeSystemPrompt()` — junta base + plan summary em um system-prompt
 *     contextual único pro agent.
 */

import { createLogger } from '@g4os/kernel/logger';
import type { Session } from '@g4os/kernel/types';
import { formatPlanForPrompt, planTurn, type SourcePlan } from '@g4os/sources/planner';
import type { SourcesStore } from '@g4os/sources/store';

const log = createLogger('plan-build');

const EMPTY_PLAN: SourcePlan = {
  nativeDeferred: [],
  brokerFallback: [],
  filesystemDirect: [],
  rejected: [],
  sticky: [],
};

export async function buildSourcePlan(
  sourcesStore: SourcesStore,
  session: Session | null,
): Promise<SourcePlan> {
  if (!session) return EMPTY_PLAN;
  try {
    const all = await sourcesStore.list(session.workspaceId);
    return planTurn({
      enabledSources: all.filter((s) => s.enabled),
      sessionEnabledSlugs: session.enabledSourceSlugs,
      stickySlugs: session.stickyMountedSourceSlugs,
      rejectedSlugs: session.rejectedSourceSlugs,
    });
  } catch (error) {
    log.warn(
      { err: String(error), sessionId: session.id },
      'failed to build source plan; proceeding without sources',
    );
    return EMPTY_PLAN;
  }
}

export function composeSystemPrompt(
  base: string | undefined,
  plan: SourcePlan,
): string | undefined {
  const hasSources =
    plan.nativeDeferred.length + plan.brokerFallback.length + plan.filesystemDirect.length > 0;
  if (!base && !hasSources) return undefined;
  const parts: string[] = [];
  if (base) parts.push(base);
  if (hasSources) parts.push(formatPlanForPrompt(plan));
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}
