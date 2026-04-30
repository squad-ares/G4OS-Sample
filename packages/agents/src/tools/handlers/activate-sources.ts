/**
 * `activate_sources` tool handler — permite ao agent solicitar montagem de
 * sources `broker_fallback` durante um turn. O handler:
 *
 *   1. Recebe lista de slugs via `input.slugs`.
 *   2. Valida contra o catálogo habilitado na sessão.
 *   3. Filtra slugs rejeitados pelo usuário ("don't use X").
 *   4. Persiste slugs aprovados em `session.stickyMountedSourceSlugs`.
 *   5. Retorna `activated[]` + `skipped[]` para o agent decidir próximos
 *      passos (continuar ou pedir auth).
 *
 * Phase 1 MVP: apenas marca sticky — o mount real dos MCP/managed handlers
 * vem quando os connectors forem implementados. Por ora serve como
 * placeholder do fluxo e dá ao agent visibilidade de intent.
 *
 * Boundary-friendly: depende apenas de `@g4os/kernel`. Main injeta
 * `SourceCatalogReader` + `SessionMetadataStore` com adapters pro
 * `SourcesStore` JSON e `SessionsRepository` SQLite.
 */

import { createLogger } from '@g4os/kernel/logger';
import type { SessionId } from '@g4os/kernel/types';
import { err, ok, type Result } from 'neverthrow';
import type { ToolHandler, ToolHandlerResult } from '../types.ts';

const log = createLogger('activate-sources-tool');

interface ActivateSourcesInput {
  readonly slugs?: unknown;
}

/** Leitor mínimo do catálogo de sources enabled por workspace. */
export interface SourceCatalogReader {
  list(
    workspaceId: string,
  ): Promise<readonly { readonly slug: string; readonly enabled: boolean }[]>;
}

export interface SessionMountState {
  readonly workspaceId: string;
  readonly stickyMountedSourceSlugs: readonly string[];
  readonly rejectedSourceSlugs: readonly string[];
}

export interface SessionMetadataStore {
  get(sessionId: SessionId): Promise<SessionMountState | null>;
  update(
    sessionId: SessionId,
    patch: { readonly stickyMountedSourceSlugs: readonly string[] },
  ): Promise<void>;
}

export interface ActivateSourcesDeps {
  readonly catalog: SourceCatalogReader;
  readonly sessions: SessionMetadataStore;
}

export function createActivateSourcesHandler(deps: ActivateSourcesDeps): ToolHandler {
  return {
    definition: {
      name: 'activate_sources',
      description:
        'Activate one or more broker sources for the current turn so their tools become available. Use when the user asks for a source that is enabled in the workspace but not yet mounted. Do not call for sources already marked as mounted.',
      inputSchema: {
        type: 'object',
        properties: {
          slugs: {
            type: 'array',
            items: { type: 'string' },
            description: 'Array of source slugs to activate, e.g. ["g4os-gmail", "g4os-github"].',
          },
        },
        required: ['slugs'],
      },
    },

    async execute(rawInput, ctx): Promise<ToolHandlerResult> {
      const parsed = parseInput(rawInput);
      if (parsed.isErr()) return err(parsed.error);

      const session = await deps.sessions.get(ctx.sessionId);
      if (!session) {
        return err({
          code: 'tool.activate_sources.session_not_found',
          message: `Session not found: ${ctx.sessionId}`,
          context: { sessionId: ctx.sessionId },
        });
      }

      const enabled = await deps.catalog.list(session.workspaceId);
      // Dedup input slugs. Caller pode passar `["gmail", "gmail"]`
      // (LLM gerou repetido), e classifySlugs duplicava o slug em activated[].
      // Resposta UI mostrava "gmail (2)" confuso.
      const requested = Array.from(new Set(parsed.value));
      const outcome = classifySlugs(requested, {
        enabledSlugs: new Set(enabled.filter((s) => s.enabled).map((s) => s.slug)),
        rejectedSlugs: new Set(session.rejectedSourceSlugs),
        stickySlugs: new Set(session.stickyMountedSourceSlugs),
      });

      if (outcome.activated.length > 0) {
        await deps.sessions.update(ctx.sessionId, {
          stickyMountedSourceSlugs: outcome.nextSticky,
        });
        log.info(
          { sessionId: ctx.sessionId, activated: outcome.activated, skipped: outcome.skipped },
          'activate_sources marked sticky',
        );
      }

      return ok({
        output: formatSummary(outcome.activated, outcome.skipped),
        metadata: { activated: outcome.activated, skipped: outcome.skipped },
      });
    },
  };
}

interface ClassifyOutcome {
  readonly activated: string[];
  readonly skipped: { slug: string; reason: string }[];
  readonly nextSticky: string[];
}

function classifySlugs(
  requested: readonly string[],
  sets: {
    readonly enabledSlugs: ReadonlySet<string>;
    readonly rejectedSlugs: ReadonlySet<string>;
    readonly stickySlugs: ReadonlySet<string>;
  },
): ClassifyOutcome {
  const activated: string[] = [];
  const skipped: { slug: string; reason: string }[] = [];
  const nextSticky = new Set(sets.stickySlugs);
  for (const slug of requested) {
    const reason = skipReason(slug, sets);
    if (reason) {
      skipped.push({ slug, reason });
      continue;
    }
    nextSticky.add(slug);
    activated.push(slug);
  }
  return { activated, skipped, nextSticky: [...nextSticky] };
}

function skipReason(
  slug: string,
  sets: {
    readonly enabledSlugs: ReadonlySet<string>;
    readonly rejectedSlugs: ReadonlySet<string>;
    readonly stickySlugs: ReadonlySet<string>;
  },
): string | null {
  if (!sets.enabledSlugs.has(slug)) return 'not enabled in workspace';
  if (sets.rejectedSlugs.has(slug)) return 'rejected by user';
  if (sets.stickySlugs.has(slug)) return 'already mounted';
  return null;
}

// Caps defensivos na entrada. LLM pode gerar `slugs` patológicos
// (string gigante, lista de 10000 entries) — sem limites, isso atinge
// o backend (busca em sourcesStore, update SQLite) com payload absurdo.
const MAX_SLUGS_PER_CALL = 32;
const MAX_SLUG_LENGTH = 100;

function parseInput(
  raw: Readonly<Record<string, unknown>>,
): Result<readonly string[], { readonly code: string; readonly message: string }> {
  const input = raw as ActivateSourcesInput;
  if (!Array.isArray(input.slugs)) {
    return err({
      code: 'tool.activate_sources.invalid_input',
      message: 'slugs must be an array of strings',
    });
  }
  if (input.slugs.length > MAX_SLUGS_PER_CALL) {
    return err({
      code: 'tool.activate_sources.invalid_input',
      message: `too many slugs (max ${MAX_SLUGS_PER_CALL})`,
    });
  }
  const slugs: string[] = [];
  for (const s of input.slugs) {
    if (typeof s !== 'string' || s.length === 0 || s.length > MAX_SLUG_LENGTH) {
      return err({
        code: 'tool.activate_sources.invalid_input',
        message: `each slug must be a non-empty string up to ${MAX_SLUG_LENGTH} chars`,
      });
    }
    slugs.push(s);
  }
  if (slugs.length === 0) {
    return err({
      code: 'tool.activate_sources.invalid_input',
      message: 'at least one slug required',
    });
  }
  return ok(slugs);
}

function formatSummary(
  activated: readonly string[],
  skipped: readonly { slug: string; reason: string }[],
): string {
  const lines: string[] = [];
  if (activated.length > 0) {
    lines.push(`Activated: ${activated.join(', ')}.`);
  }
  if (skipped.length > 0) {
    const skippedStr = skipped.map((s) => `${s.slug} (${s.reason})`).join(', ');
    lines.push(`Skipped: ${skippedStr}.`);
  }
  if (lines.length === 0) lines.push('No sources to activate.');
  return lines.join(' ');
}
