import { describe, expect, it } from 'vitest';
import {
  filterSessionTools,
  type SessionToolDescriptor,
  type SessionToolProfile,
  shouldExposeSessionTool,
} from '../../shared/broker/session-tools.ts';

function tool(
  name: string,
  category: SessionToolDescriptor['category'],
  priority = 100,
): SessionToolDescriptor {
  return {
    name,
    originalName: name,
    description: name,
    kind: 'session',
    serverName: 'session',
    category,
    priority,
  };
}

function profile(overrides: Partial<SessionToolProfile> = {}): SessionToolProfile {
  return {
    promptMode: 'default',
    requiresPlan: false,
    requiresDelegation: false,
    requiresBrowserInteraction: false,
    requiresSourceTools: false,
    continuation: false,
    includeCompanyContextTools: false,
    includeSourceAdminTools: false,
    includeSchedulerTools: false,
    includeVigiaTools: false,
    includeMarketplaceTools: false,
    includeHistoryTools: false,
    includeValidationTools: false,
    includeSecondaryLlmTools: false,
    ...overrides,
  };
}

describe('shouldExposeSessionTool', () => {
  it('returns false for any tool when promptMode is gemini_native', () => {
    const p = profile({ promptMode: 'gemini_native', requiresPlan: true });
    expect(shouldExposeSessionTool(tool('plan_tool', 'plan'), p)).toBe(false);
    expect(shouldExposeSessionTool(tool('core_tool', 'core'), p)).toBe(false);
  });

  it('always exposes core tools in default/custom_tools modes', () => {
    expect(shouldExposeSessionTool(tool('echo', 'core'), profile())).toBe(true);
    expect(
      shouldExposeSessionTool(tool('echo', 'core'), profile({ promptMode: 'custom_tools' })),
    ).toBe(true);
  });

  it('gates category-specific tools behind their flags', () => {
    expect(shouldExposeSessionTool(tool('plan_tool', 'plan'), profile())).toBe(false);
    expect(
      shouldExposeSessionTool(tool('plan_tool', 'plan'), profile({ requiresPlan: true })),
    ).toBe(true);
  });
});

describe('filterSessionTools', () => {
  it('sorts by priority ascending then name', () => {
    const all = [tool('b_core', 'core', 5), tool('a_core', 'core', 5), tool('c_core', 'core', 1)];
    const sorted = filterSessionTools(all, profile());
    expect(sorted.map((t) => t.name)).toEqual(['c_core', 'a_core', 'b_core']);
  });

  it('filters out tools gated by profile', () => {
    const all = [tool('plan_a', 'plan'), tool('core_a', 'core'), tool('vigia_a', 'vigia')];
    const out = filterSessionTools(all, profile({ requiresPlan: true }));
    expect(out.map((t) => t.name)).toEqual(['core_a', 'plan_a']);
  });

  it('returns empty array for gemini_native regardless of flags', () => {
    const all = [tool('core_a', 'core'), tool('plan_a', 'plan')];
    expect(
      filterSessionTools(all, profile({ promptMode: 'gemini_native', requiresPlan: true })),
    ).toEqual([]);
  });
});
