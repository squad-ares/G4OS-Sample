/**
 * Boot-time cleanup of orphan `.tmp` files left by `truncateAfter` JSONL
 * crashes (CR4-15 + CR5-01 wiring). Best-effort: scan all sessions in
 * parallel via `Promise.allSettled` so one bad workspace doesn't block
 * boot. Errors logged at warn level — boot continues.
 */

import type { AppDb } from '@g4os/data';
import { SessionEventStore } from '@g4os/data/events';
import { sessions as sessionsTable } from '@g4os/data/schema';
import type { Logger } from '@g4os/kernel/logger';

export function scheduleOrphanTmpCleanup(drizzle: AppDb, log: Logger): void {
  void (async () => {
    try {
      const allSessions = drizzle.select().from(sessionsTable).all();
      const cleanupTasks = allSessions.map(async (s) => {
        const store = new SessionEventStore(s.workspaceId);
        try {
          const removed = await store.cleanupOrphanTmp(s.id);
          if (removed > 0) {
            log.info({ sessionId: s.id, removed }, 'orphan tmp cleaned at boot');
          }
        } catch (err) {
          log.warn({ err, sessionId: s.id }, 'orphan tmp cleanup failed');
        }
      });
      await Promise.allSettled(cleanupTasks);
    } catch (err) {
      log.warn({ err }, 'orphan tmp scan errored');
    }
  })();
}
