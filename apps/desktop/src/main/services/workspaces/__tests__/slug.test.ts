import { describe, expect, it } from 'vitest';
import { slugifyWorkspaceName } from '../slug.ts';

describe('slugifyWorkspaceName', () => {
  it('normalizes diacritics and whitespace', () => {
    expect(slugifyWorkspaceName('Minha Área')).toBe('minha-area');
  });

  it('replaces runs of non-alphanumerics with a single dash', () => {
    expect(slugifyWorkspaceName('  Work & Play!!  ')).toBe('work-play');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugifyWorkspaceName('--hi--')).toBe('hi');
  });

  it('falls back when result would be empty', () => {
    const fallback = slugifyWorkspaceName('!!!');
    expect(fallback.startsWith('workspace-')).toBe(true);
  });

  it('truncates to 60 characters', () => {
    const long = 'a'.repeat(120);
    const slug = slugifyWorkspaceName(long);
    expect(slug.length).toBeLessThanOrEqual(60);
  });
});
