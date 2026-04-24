/**
 * `buildMountedHandlers` — traduz um `SourcePlan` + sticky set em
 * `ToolHandler[]` mountados via `McpMountRegistry`.
 *
 * Escopo atual: só monta `mcp-stdio`. Managed connectors ainda dependem de
 * OAuth live mount (FOLLOWUP-OUTLIER-12 Phase 2 / MVP Step 2).
 *
 * Adapta `SourceConfigView` (persistência) → `SourceConfig` (contrato do
 * factory), sintetizando `metadata` a partir dos top-level fields (slug,
 * displayName, category, authKind) que o store mantém separados mas a
 * factory espera dentro de `config.metadata`.
 */

import type { ToolHandler } from '@g4os/agents/tools';
import { createLogger } from '@g4os/kernel/logger';
import type { Session, SourceConfigView } from '@g4os/kernel/types';
import {
  buildMountedToolHandlers,
  type McpMountRegistry,
  type MountedSource,
} from '@g4os/sources/broker';
import type { SourceConfig } from '@g4os/sources/interface';
import type { SourcePlan } from '@g4os/sources/planner';
import type { SourcesStore } from '@g4os/sources/store';

const log = createLogger('mount-plan');

export interface BuildMountedHandlersInput {
  readonly mountRegistry: McpMountRegistry | undefined;
  readonly sourcesStore: SourcesStore;
  readonly plan: SourcePlan;
  readonly session: Session | null;
}

export async function buildMountedHandlers(
  input: BuildMountedHandlersInput,
): Promise<readonly ToolHandler[]> {
  const { mountRegistry, sourcesStore, plan, session } = input;
  if (!mountRegistry || !session) return [];
  const sticky = new Set(session.stickyMountedSourceSlugs ?? []);
  const brokerStdioSlugs = plan.brokerFallback
    .filter((item) => sticky.has(item.slug) && item.kind === 'mcp-stdio')
    .map((item) => item.slug);
  if (brokerStdioSlugs.length === 0) return [];

  const views = await sourcesStore.list(session.workspaceId);
  const configs: SourceConfig[] = [];
  for (const slug of brokerStdioSlugs) {
    const view = views.find((v) => v.slug === slug);
    if (!view) continue;
    configs.push(toSourceConfig(view));
  }
  if (configs.length === 0) return [];

  const mounted: readonly MountedSource[] = await mountRegistry.ensureMounted(configs);
  log.debug(
    { sessionId: session.id, requested: configs.length, mounted: mounted.length },
    'ensureMounted result',
  );
  return buildMountedToolHandlers(mounted).handlers;
}

function toSourceConfig(view: SourceConfigView): SourceConfig {
  return {
    slug: view.slug,
    kind: view.kind,
    config: {
      ...view.config,
      metadata: {
        slug: view.slug,
        displayName: view.displayName,
        category: view.category,
        requiresAuth: view.authKind !== 'none',
      },
    },
  };
}
