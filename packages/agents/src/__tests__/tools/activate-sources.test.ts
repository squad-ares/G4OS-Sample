import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createActivateSourcesHandler,
  type SessionMetadataStore,
  type SourceCatalogReader,
} from '../../tools/handlers/activate-sources.ts';
import type { ToolContext } from '../../tools/types.ts';

function makeCatalog(enabled: readonly { slug: string; enabled: boolean }[]): SourceCatalogReader {
  return { list: vi.fn().mockResolvedValue(enabled) };
}

function makeSessions(initial: {
  workspaceId?: string;
  sticky?: readonly string[];
  rejected?: readonly string[];
  notFound?: boolean;
}): SessionMetadataStore & {
  readonly updates: Array<{
    sessionId: string;
    patch: { readonly stickyMountedSourceSlugs: readonly string[] };
  }>;
} {
  const updates: Array<{
    sessionId: string;
    patch: { readonly stickyMountedSourceSlugs: readonly string[] };
  }> = [];
  return {
    updates,
    get: vi.fn().mockResolvedValue(
      initial.notFound
        ? null
        : {
            workspaceId: initial.workspaceId ?? 'ws-1',
            stickyMountedSourceSlugs: initial.sticky ?? [],
            rejectedSourceSlugs: initial.rejected ?? [],
          },
    ),
    update: vi.fn().mockImplementation((sessionId, patch) => {
      updates.push({ sessionId, patch });
      return Promise.resolve();
    }),
  };
}

function makeCtx(): ToolContext {
  const controller = new AbortController();
  return {
    sessionId: randomUUID(),
    turnId: randomUUID(),
    toolUseId: 'tu-1',
    workingDirectory: '/tmp',
    signal: controller.signal,
  };
}

describe('activate_sources handler', () => {
  it('rejects invalid input (missing slugs array)', async () => {
    const handler = createActivateSourcesHandler({
      catalog: makeCatalog([]),
      sessions: makeSessions({}),
    });
    const r = await handler.execute({}, makeCtx());
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('tool.activate_sources.invalid_input');
  });

  it('rejects empty slugs list', async () => {
    const handler = createActivateSourcesHandler({
      catalog: makeCatalog([]),
      sessions: makeSessions({}),
    });
    const r = await handler.execute({ slugs: [] }, makeCtx());
    expect(r.isErr()).toBe(true);
  });

  it('errors when session is not found', async () => {
    const handler = createActivateSourcesHandler({
      catalog: makeCatalog([]),
      sessions: makeSessions({ notFound: true }),
    });
    const r = await handler.execute({ slugs: ['gmail'] }, makeCtx());
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.code).toBe('tool.activate_sources.session_not_found');
  });

  it('activates enabled slugs and persists sticky', async () => {
    const sessions = makeSessions({ sticky: [] });
    const handler = createActivateSourcesHandler({
      catalog: makeCatalog([
        { slug: 'gmail', enabled: true },
        { slug: 'slack', enabled: true },
      ]),
      sessions,
    });
    const r = await handler.execute({ slugs: ['gmail'] }, makeCtx());
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.metadata?.activated).toEqual(['gmail']);
      expect(r.value.metadata?.skipped).toEqual([]);
      expect(r.value.output).toContain('Activated: gmail');
    }
    expect(sessions.updates).toHaveLength(1);
    expect(sessions.updates[0]?.patch.stickyMountedSourceSlugs).toEqual(['gmail']);
  });

  it('skips slugs rejected by the user and does not persist them', async () => {
    const sessions = makeSessions({ sticky: [], rejected: ['hubspot'] });
    const handler = createActivateSourcesHandler({
      catalog: makeCatalog([
        { slug: 'gmail', enabled: true },
        { slug: 'hubspot', enabled: true },
      ]),
      sessions,
    });
    const r = await handler.execute({ slugs: ['gmail', 'hubspot'] }, makeCtx());
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.metadata?.activated).toEqual(['gmail']);
      const skipped = r.value.metadata?.skipped as { slug: string; reason: string }[];
      expect(skipped).toEqual([{ slug: 'hubspot', reason: 'rejected by user' }]);
    }
  });

  it('skips slugs not in the workspace catalog', async () => {
    const sessions = makeSessions({});
    const handler = createActivateSourcesHandler({
      catalog: makeCatalog([{ slug: 'gmail', enabled: true }]),
      sessions,
    });
    const r = await handler.execute({ slugs: ['unknown-slug'] }, makeCtx());
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const skipped = r.value.metadata?.skipped as { slug: string; reason: string }[];
      expect(skipped[0]?.reason).toBe('not enabled in workspace');
    }
    expect(sessions.updates).toHaveLength(0);
  });

  it('skips slugs that are already mounted (sticky)', async () => {
    const sessions = makeSessions({ sticky: ['gmail'] });
    const handler = createActivateSourcesHandler({
      catalog: makeCatalog([{ slug: 'gmail', enabled: true }]),
      sessions,
    });
    const r = await handler.execute({ slugs: ['gmail'] }, makeCtx());
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const skipped = r.value.metadata?.skipped as { slug: string; reason: string }[];
      expect(skipped[0]?.reason).toBe('already mounted');
    }
    // Nada para persistir — já estava sticky
    expect(sessions.updates).toHaveLength(0);
  });

  it('merges new sticky with existing sticky set (no dupes)', async () => {
    const sessions = makeSessions({ sticky: ['gmail'] });
    const handler = createActivateSourcesHandler({
      catalog: makeCatalog([
        { slug: 'gmail', enabled: true },
        { slug: 'slack', enabled: true },
      ]),
      sessions,
    });
    const r = await handler.execute({ slugs: ['slack'] }, makeCtx());
    expect(r.isOk()).toBe(true);
    expect(sessions.updates).toHaveLength(1);
    expect(sessions.updates[0]?.patch.stickyMountedSourceSlugs).toEqual(['gmail', 'slack']);
  });

  it('rejects non-string slug entries as invalid input', async () => {
    const handler = createActivateSourcesHandler({
      catalog: makeCatalog([]),
      sessions: makeSessions({}),
    });
    const r = await handler.execute({ slugs: [42] }, makeCtx());
    expect(r.isErr()).toBe(true);
  });
});
