/**
 * Adapters pra ligar o `activate_sources` tool handler (em `@g4os/agents/tools`)
 * com `SourcesStore` (sources JSON) + `SessionsRepository` (SQLite) sem criar
 * dependência cruzada no package. Main é o composition root.
 */

import {
  createActivateSourcesHandler,
  createToolRegistry,
  listDirHandler,
  readFileHandler,
  runBashHandler,
  type ToolCatalog,
  writeFileHandler,
} from '@g4os/agents/tools';
import type { SessionsRepository } from '@g4os/data/sessions';
import type { SessionId } from '@g4os/kernel/types';
import type { SourcesStore } from '@g4os/sources/store';
import type { SessionIntentUpdater } from './turn-dispatcher.ts';

export interface BuildToolCatalogDeps {
  readonly sourcesStore: SourcesStore;
  readonly sessionsRepo: SessionsRepository;
}

/** Adapter pro `TurnDispatcher.sessionIntentUpdater` — isolado aqui pra
 *  manter main/index.ts ≤300 LOC. */
export function buildIntentUpdater(sessionsRepo: SessionsRepository): SessionIntentUpdater {
  return {
    updateRejected: async (id: SessionId, rejectedSlugs) => {
      await sessionsRepo.update(id, { rejectedSourceSlugs: [...rejectedSlugs] });
    },
    updateSticky: async (id: SessionId, stickySlugs) => {
      await sessionsRepo.update(id, { stickyMountedSourceSlugs: [...stickySlugs] });
    },
  };
}

export function buildToolCatalog(deps: BuildToolCatalogDeps): ToolCatalog {
  const activateSourcesHandler = createActivateSourcesHandler({
    catalog: {
      list: async (workspaceId) => {
        const rows = await deps.sourcesStore.list(workspaceId);
        return rows.map((s) => ({ slug: s.slug, enabled: s.enabled }));
      },
    },
    sessions: {
      get: async (sessionId) => {
        const row = await deps.sessionsRepo.get(sessionId);
        if (!row) return null;
        return {
          workspaceId: row.workspaceId,
          stickyMountedSourceSlugs: row.stickyMountedSourceSlugs,
          rejectedSourceSlugs: row.rejectedSourceSlugs,
        };
      },
      update: async (sessionId, patch) => {
        await deps.sessionsRepo.update(sessionId, {
          stickyMountedSourceSlugs: [...patch.stickyMountedSourceSlugs],
        });
      },
    },
  });
  return createToolRegistry([
    listDirHandler,
    readFileHandler,
    writeFileHandler,
    runBashHandler,
    activateSourcesHandler,
  ]);
}
