/**
 * Helper que roda intent detection no texto do usuário antes da turn
 * despachar. Extraído de `TurnDispatcher` pra manter o dispatcher ≤300 LOC.
 *
 *   - Rejeições ("don't use X") viram sticky em `session.rejectedSourceSlugs`
 *     (suppressed em todos os turns futuros até UI/usuário desbloquear).
 *   - Explicit `[source:slug]` + mentions `@slug` viram sticky mount em
 *     `session.stickyMountedSourceSlugs`.
 *
 * Intent soft (fraco, sem explicit/mention) é ignorado — o planner (ADR-0137)
 * ainda filtra por `sessionEnabledSlugs` + `rejectedSlugs`.
 */

import { createLogger } from '@g4os/kernel/logger';
import type { Session, SessionId } from '@g4os/kernel/types';
import type { SourceIntentDetector } from '@g4os/sources/lifecycle';
import type { SourcesStore } from '@g4os/sources/store';

const log = createLogger('apply-intent');

export interface SessionIntentUpdater {
  updateRejected(sessionId: SessionId, rejectedSlugs: readonly string[]): Promise<void>;
  updateSticky(sessionId: SessionId, stickySlugs: readonly string[]): Promise<void>;
}

export interface ApplyIntentDeps {
  readonly detector: SourceIntentDetector;
  readonly sourcesStore: SourcesStore;
  readonly updater: SessionIntentUpdater | undefined;
}

export async function applyTurnIntent(
  deps: ApplyIntentDeps,
  sessionId: SessionId,
  text: string,
  session: Session | null,
): Promise<void> {
  if (!session) return;
  if (!deps.updater) {
    // Composição incompleta — em testes é esperado (mock partial); em
    // produção indica bug de wiring que deixaria UX silenciosamente
    // quebrada (sticky/rejected sources nunca persistidos).
    log.warn({ sessionId }, 'intent updater unavailable; intent detection skipped');
    return;
  }
  try {
    const enabled = await deps.sourcesStore.list(session.workspaceId);
    const available = enabled
      .filter((s) => s.enabled)
      .map((s) => ({ slug: s.slug, displayName: s.displayName }));
    const rejections = deps.detector.detectRejections(text, { availableSources: available });
    if (rejections.length > 0) {
      const nextRejected = unique([...session.rejectedSourceSlugs, ...rejections]);
      await deps.updater.updateRejected(sessionId, nextRejected);
      log.info({ sessionId, rejections }, 'applied source rejections from intent');
    }
    const intent = deps.detector.detect(text, { availableSources: available });
    if (intent.kind === 'explicit' || intent.kind === 'mention') {
      const rejectedSet = new Set([...session.rejectedSourceSlugs, ...rejections]);
      const additions = intent.sources.filter((s) => !rejectedSet.has(s));
      if (additions.length > 0) {
        const nextSticky = unique([...session.stickyMountedSourceSlugs, ...additions]);
        await deps.updater.updateSticky(sessionId, nextSticky);
        log.info({ sessionId, additions, kind: intent.kind }, 'applied source mount intent');
      }
    }
  } catch (error) {
    log.warn({ err: String(error), sessionId }, 'intent detection failed; proceeding');
  }
}

function unique(xs: readonly string[]): string[] {
  return Array.from(new Set(xs));
}
