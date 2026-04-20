import { describe, expect, it } from 'vitest';
import {
  detectBrokeredSourceActivation,
  detectSourceAccessIssue,
  type SourceAccessState,
  type SourceManagerLike,
} from '../../shared/broker/source-activation.ts';

function mgr(state: SourceAccessState | null, slug: string | null = 'hubspot'): SourceManagerLike {
  return {
    getSourceAccessState: () => state,
    resolveSourceSlugForTool: () => slug,
  };
}

describe('detectSourceAccessIssue', () => {
  it('returns null when not an error', () => {
    expect(detectSourceAccessIssue('x', 'ok', false, mgr('not_enabled'))).toBeNull();
  });

  it('returns null when tool has no mapped source slug', () => {
    expect(detectSourceAccessIssue('x', 'err', true, mgr('not_enabled', null))).toBeNull();
  });

  it('returns null when state is ok or unknown', () => {
    expect(detectSourceAccessIssue('x', 'err', true, mgr('ok'))).toBeNull();
    expect(detectSourceAccessIssue('x', 'err', true, mgr(null))).toBeNull();
  });

  it('returns slug+state for a real access issue', () => {
    expect(detectSourceAccessIssue('x', 'err', true, mgr('auth_required'))).toEqual({
      sourceSlug: 'hubspot',
      state: 'auth_required',
    });
  });
});

describe('detectBrokeredSourceActivation', () => {
  it('returns null for wrong tool name', () => {
    expect(detectBrokeredSourceActivation('other_tool', { sourceSlug: 'a' }, false)).toBeNull();
  });

  it('returns null on error', () => {
    expect(
      detectBrokeredSourceActivation('activate_sources', { sourceSlug: 'a' }, true),
    ).toBeNull();
  });

  it('returns null for non-object or missing slug', () => {
    expect(detectBrokeredSourceActivation('activate_sources', null, false)).toBeNull();
    expect(detectBrokeredSourceActivation('activate_sources', { foo: 1 }, false)).toBeNull();
    expect(
      detectBrokeredSourceActivation('activate_sources', { sourceSlug: '' }, false),
    ).toBeNull();
  });

  it('returns slug when result is well-formed', () => {
    expect(
      detectBrokeredSourceActivation('activate_sources', { sourceSlug: 'hubspot' }, false),
    ).toEqual({
      sourceSlug: 'hubspot',
    });
  });
});
