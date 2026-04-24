import type { SourceConfigView } from '@g4os/kernel/types';
import { describe, expect, it } from 'vitest';
import { formatPlanForPrompt, planTurn } from '../planner/source-planner.ts';

function makeSource(overrides: Partial<SourceConfigView> & { slug: string }): SourceConfigView {
  return {
    id: `src-${overrides.slug}`,
    slug: overrides.slug,
    displayName: overrides.displayName ?? overrides.slug,
    kind: overrides.kind ?? 'managed',
    status: overrides.status ?? 'connected',
    enabled: true,
    authType: 'none',
    config: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as SourceConfigView;
}

describe('planTurn classification', () => {
  it('maps managed/api/mcp-http to native_deferred', () => {
    const plan = planTurn({
      enabledSources: [
        makeSource({ slug: 'gmail', kind: 'managed' }),
        makeSource({ slug: 'github-http', kind: 'mcp-http' }),
        makeSource({ slug: 'my-api', kind: 'api' }),
      ],
      stickySlugs: [],
      rejectedSlugs: [],
    });
    expect(plan.nativeDeferred.map((s) => s.slug)).toEqual(['gmail', 'github-http', 'my-api']);
    expect(plan.brokerFallback).toHaveLength(0);
    expect(plan.filesystemDirect).toHaveLength(0);
  });

  it('routes filesystem to filesystem_direct and mcp-stdio to broker_fallback', () => {
    const plan = planTurn({
      enabledSources: [
        makeSource({ slug: 'my-docs', kind: 'filesystem' }),
        makeSource({ slug: 'local-mcp', kind: 'mcp-stdio' }),
      ],
      stickySlugs: [],
      rejectedSlugs: [],
    });
    expect(plan.filesystemDirect.map((s) => s.slug)).toEqual(['my-docs']);
    expect(plan.brokerFallback.map((s) => s.slug)).toEqual(['local-mcp']);
  });

  it('drops rejected sources from every bucket', () => {
    const plan = planTurn({
      enabledSources: [
        makeSource({ slug: 'hubspot', kind: 'managed' }),
        makeSource({ slug: 'gmail', kind: 'managed' }),
      ],
      stickySlugs: [],
      rejectedSlugs: ['hubspot'],
    });
    expect(plan.nativeDeferred.map((s) => s.slug)).toEqual(['gmail']);
    expect(plan.rejected).toEqual(['hubspot']);
  });

  it('respects sessionEnabledSlugs filter when provided (undefined = all, [] = none)', () => {
    const sources = [
      makeSource({ slug: 'gmail', kind: 'managed' }),
      makeSource({ slug: 'slack', kind: 'managed' }),
    ];
    // undefined = todas entram
    const planAll = planTurn({ enabledSources: sources, stickySlugs: [], rejectedSlugs: [] });
    expect(planAll.nativeDeferred).toHaveLength(2);

    // [] = nenhuma entra
    const planNone = planTurn({
      enabledSources: sources,
      sessionEnabledSlugs: [],
      stickySlugs: [],
      rejectedSlugs: [],
    });
    expect(planNone.nativeDeferred).toHaveLength(0);

    // explicit list
    const planOne = planTurn({
      enabledSources: sources,
      sessionEnabledSlugs: ['gmail'],
      stickySlugs: [],
      rejectedSlugs: [],
    });
    expect(planOne.nativeDeferred.map((s) => s.slug)).toEqual(['gmail']);
  });

  it('carries status forward to plan items', () => {
    const plan = planTurn({
      enabledSources: [makeSource({ slug: 'gmail', kind: 'managed', status: 'needs_auth' })],
      stickySlugs: [],
      rejectedSlugs: [],
    });
    expect(plan.nativeDeferred[0]?.status).toBe('needs_auth');
  });
});

describe('formatPlanForPrompt', () => {
  it('omits sources with status !== connected from the Available list', () => {
    const plan = planTurn({
      enabledSources: [
        makeSource({ slug: 'gmail', kind: 'managed', status: 'connected' }),
        makeSource({ slug: 'slack', kind: 'managed', status: 'needs_auth' }),
      ],
      stickySlugs: [],
      rejectedSlugs: [],
    });
    const prompt = formatPlanForPrompt(plan);
    expect(prompt).toContain('Available sources: gmail');
    expect(prompt).not.toContain('Available sources: slack');
    expect(prompt).toContain('Not connected');
    expect(prompt).toContain('slack');
  });

  it('emits "No workspace sources" when nothing is connected', () => {
    const plan = planTurn({
      enabledSources: [makeSource({ slug: 'gmail', status: 'needs_auth' })],
      stickySlugs: [],
      rejectedSlugs: [],
    });
    const prompt = formatPlanForPrompt(plan);
    expect(prompt).toContain('No workspace sources are currently available.');
  });

  it('lists rejected sources at the end', () => {
    const plan = planTurn({
      enabledSources: [makeSource({ slug: 'gmail' })],
      stickySlugs: [],
      rejectedSlugs: ['hubspot'],
    });
    const prompt = formatPlanForPrompt(plan);
    expect(prompt).toContain('Rejected by user: hubspot');
  });

  it('marks sticky sources as *mounted* in the Available list', () => {
    const plan = planTurn({
      enabledSources: [makeSource({ slug: 'gmail' })],
      stickySlugs: ['gmail'],
      rejectedSlugs: [],
    });
    expect(formatPlanForPrompt(plan)).toContain('*mounted*');
  });
});
