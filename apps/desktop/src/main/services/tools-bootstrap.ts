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
  type ToolCatalog,
} from '@g4os/agents/tools';
import type { SessionsRepository } from '@g4os/data/sessions';
import type { SourcesStore } from '@g4os/sources/store';

export interface BuildToolCatalogDeps {
  readonly sourcesStore: SourcesStore;
  readonly sessionsRepo: SessionsRepository;
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
          stickyMountedSourceSlugs: patch.stickyMountedSourceSlugs,
        });
      },
    },
  });
  return createToolRegistry([listDirHandler, readFileHandler, activateSourcesHandler]);
}
