/**
 * V2 writers para `@g4os/migration` — adaptam serviços main-side
 * (drizzle, repositories, stores) ao contrato dos writers do package
 * de migração.
 *
 * Por que aqui e não no package: writers precisam de Electron-side state
 * (drizzle handle, file paths via env-paths, etc.) que não pertencem a
 * `@g4os/migration` (que é puro). Essa é a camada de cola.
 */

import type { AppDb } from '@g4os/data';
import { applyEvent, SessionEventStore } from '@g4os/data/events';
import { workspaces } from '@g4os/data/schema';
import type { SessionsRepository } from '@g4os/data/sessions';
import type {
  SessionEvent,
  SessionProvider,
  SourceAuthKind,
  SourceCategory,
} from '@g4os/kernel/types';
import type {
  V2SessionMetadata,
  V2SessionWriter,
  V2SourceInput,
  V2SourceWriter,
  V2WorkspaceInput,
  V2WorkspaceWriter,
} from '@g4os/migration';
import type { SourcesStore } from '@g4os/sources/store';
import { eq } from 'drizzle-orm';
import { bootstrapWorkspaceFilesystem } from '../workspaces/filesystem.ts';

/** Maps V1 slug heuristics → V2 source category. Default: 'other'. */
const SOURCE_CATEGORY_MAP: Record<string, SourceCategory> = {
  gmail: 'google',
  'google-calendar': 'google',
  'google-drive': 'google',
  'google-docs': 'google',
  'google-sheets': 'google',
  outlook: 'microsoft',
  'outlook-calendar': 'microsoft',
  teams: 'microsoft',
  slack: 'slack',
  github: 'dev',
  linear: 'pm',
  jira: 'pm',
  asana: 'pm',
  trello: 'pm',
  pipedrive: 'crm',
};

export interface WritersDeps {
  readonly drizzle: AppDb;
  readonly sessionsRepo: SessionsRepository;
  readonly sourcesStore: SourcesStore;
  readonly resolveWorkspaceRoot: (id: string) => string;
}

/**
 * Constrói o V2WorkspaceWriter usando drizzle direto (preserva V1 IDs)
 * + bootstrap de filesystem mínimo (cria pastas necessárias). Não chama
 * `seedBundledSkills` — skills serão migradas pelo step `skills`.
 */
export function buildWorkspaceWriter(deps: WritersDeps): V2WorkspaceWriter {
  return {
    exists: async (id: string) => {
      const rows = await deps.drizzle
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.id, id))
        .limit(1);
      return rows.length > 0;
    },
    create: async (input: V2WorkspaceInput) => {
      const now = Date.now();
      const rootPath = deps.resolveWorkspaceRoot(input.id);
      const slug = input.slug || input.id;
      // V1 metadata (color/description/category) não mapeia 1:1 para V2
      // (que tem schema próprio: iconId/theme/companyContextBound). Preserva
      // os fields originais sob `v1Imported` pra usuário recuperar via UI
      // de configurações do workspace pós-migração.
      const metadata = {
        v1Imported: {
          ...(input.color ? { color: input.color } : {}),
          ...(input.description ? { description: input.description } : {}),
          ...(input.category ? { category: input.category } : {}),
        },
      };
      await deps.drizzle.insert(workspaces).values({
        id: input.id,
        name: input.name,
        slug,
        rootPath,
        createdAt: now,
        updatedAt: now,
        metadata: JSON.stringify(metadata),
      });
      // Bootstrap filesystem — cria <root>/sessions, <root>/projects etc.
      // Sem isso, próximas writes (sessões, sources) acham EACCES/ENOENT.
      await bootstrapWorkspaceFilesystem(rootPath);
    },
  };
}

/**
 * V2SourceWriter — usa SourcesStore.insert. Mapeia category por slug
 * heurístico (google/microsoft/slack/dev/pm/crm) com fallback 'other'.
 * authKind é 'oauth' se há credentialKey, senão 'none' — V1 não distinguia
 * api_key vs oauth no shape.
 */
export function buildSourceWriter(deps: WritersDeps): V2SourceWriter {
  return {
    exists: async (workspaceId: string, slug: string) => {
      const list = await deps.sourcesStore.list(workspaceId);
      return list.some((s) => s.slug === slug);
    },
    add: async (input: V2SourceInput) => {
      const category = SOURCE_CATEGORY_MAP[input.slug] ?? 'other';
      const authKind: SourceAuthKind = input.credentialKey ? 'oauth' : 'none';
      await deps.sourcesStore.insert({
        workspaceId: input.workspaceId,
        slug: input.slug,
        kind: input.kind,
        displayName: input.displayName,
        category,
        authKind,
        enabled: input.enabled,
        config: input.config,
        ...(input.credentialKey ? { credentialKey: input.credentialKey } : {}),
        ...(input.description ? { description: input.description } : {}),
      });
    },
  };
}

/**
 * V2SessionWriter — combina SessionsRepository (registro SQLite) +
 * SessionEventStore (JSONL append-only) + applyEvent (atualiza projection).
 *
 * Migrate-sessions valida cada evento via SessionEventSchema antes de passar
 * pra appendEvent. O evento validado PODE carregar `sequenceNumber` V1 (com
 * gaps, ordem irregular ou duplicatas). F-CR40-1 (ADR-0043): DEVE strippar
 * `sequenceNumber` antes de passar para o store para que o store calcule a
 * sequência monotônica correta baseada no count atual da sessão. Checkpoints
 * multi-consumer `(consumer_name, session_id)` dependem de sequência sem gaps.
 */
export function buildSessionWriter(deps: WritersDeps): V2SessionWriter {
  return {
    existsSession: async (_workspaceId: string, sessionId: string) => {
      const session = await deps.sessionsRepo.get(sessionId);
      return session !== null;
    },
    createSession: async (meta: V2SessionMetadata) => {
      // Provider V1 pode ser string arbitrária; só persistimos se cair na
      // enum V2 (claude/openai/openai_compat/gemini/bedrock/codex). Senão
      // omite — turn dispatcher usa default da config no boot da sessão.
      const provider = isValidProvider(meta.provider) ? meta.provider : undefined;
      await deps.sessionsRepo.create({
        id: meta.id,
        workspaceId: meta.workspaceId,
        name: meta.name,
        ...(provider ? { provider } : {}),
        ...(meta.modelId ? { modelId: meta.modelId } : {}),
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      });
    },
    appendEvent: async (sessionId: string, event: unknown) => {
      const session = await deps.sessionsRepo.get(sessionId);
      if (!session) throw new Error(`appendEvent: session ${sessionId} not found`);
      const store = new SessionEventStore(session.workspaceId);

      // F-CR40-1 (ADR-0043): strip sequenceNumber V1 antes de passar ao store.
      // V1 pode ter sequences com gaps, ordem irregular ou duplicatas
      // (ex.: [3, 0, 1, 7, 2]). SessionEventStore.append não recompõe — passa
      // direto pro appendFile. Se o sequenceNumber V1 entrar no JSONL V2, os
      // checkpoints multi-consumer (consumer_name, session_id) ficam
      // permanentemente dessincronizados. Strip aqui; store calcula
      // nextSeq = count(sessionId) na camada de store para garantir monotônico.
      const eventWithV1SeqStripped = event as Record<string, unknown>;
      const { sequenceNumber: _v1Seq, ...strippedEvent } = eventWithV1SeqStripped;
      // Recalcula sequência monotônica a partir do count atual da sessão.
      const nextSeq = await store.count(sessionId);
      const eventWithNewSeq = { ...strippedEvent, sequenceNumber: nextSeq } as SessionEvent;

      await store.append(sessionId, eventWithNewSeq);
      applyEvent(deps.drizzle, eventWithNewSeq);
    },
  };
}

const VALID_PROVIDERS = new Set<SessionProvider>([
  'claude',
  'openai',
  'openai_compat',
  'gemini',
  'bedrock',
  'codex',
]);

function isValidProvider(p: string | undefined): p is SessionProvider {
  return p !== undefined && VALID_PROVIDERS.has(p as SessionProvider);
}
