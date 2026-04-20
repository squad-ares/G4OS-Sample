import { describe, expect, it } from 'vitest';
import {
  classifyForSafeMode,
  SAFE_MODE_ALLOWED_TOOLS,
  SAFE_MODE_FORBIDDEN_TOOLS,
} from '../../permissions/safe-allowlist.ts';

describe('classifyForSafeMode', () => {
  it('classifies known read-only tools as allowed', () => {
    for (const t of SAFE_MODE_ALLOWED_TOOLS) {
      expect(classifyForSafeMode(t)).toBe('allowed');
    }
  });

  it('classifies mutation tools as forbidden', () => {
    for (const t of SAFE_MODE_FORBIDDEN_TOOLS) {
      expect(classifyForSafeMode(t)).toBe('forbidden');
    }
  });

  it('classifies unknown tools as unknown', () => {
    expect(classifyForSafeMode('random_tool')).toBe('unknown');
  });

  it('forbidden list and allowed list do not overlap', () => {
    for (const t of SAFE_MODE_ALLOWED_TOOLS) {
      expect(SAFE_MODE_FORBIDDEN_TOOLS.has(t)).toBe(false);
    }
  });
});
