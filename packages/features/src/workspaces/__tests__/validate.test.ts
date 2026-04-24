import { describe, expect, it } from 'vitest';
import { validateWorkspaceDefaults } from '../logic/validate.ts';

describe('validateWorkspaceDefaults', () => {
  it('flags empty name as required', () => {
    const issues = validateWorkspaceDefaults({ name: '   ' });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe('name');
    expect(issues[0]?.code).toBe('required');
  });

  it('flags short name as too-short', () => {
    const issues = validateWorkspaceDefaults({ name: 'a' });
    expect(issues[0]?.code).toBe('too-short');
  });

  it('accepts absolute path on unix and windows', () => {
    const unix = validateWorkspaceDefaults({
      name: 'Work',
      defaults: { workingDirectory: '/Users/me/work' },
    });
    expect(unix).toHaveLength(0);

    const windows = validateWorkspaceDefaults({
      name: 'Work',
      defaults: { workingDirectory: 'C:\\Users\\me\\work' },
    });
    expect(windows).toHaveLength(0);
  });

  it('rejects relative working dir path', () => {
    const issues = validateWorkspaceDefaults({
      name: 'Work',
      defaults: { workingDirectory: 'relative/path' },
    });
    const issue = issues.find((i) => i.field === 'workingDirectory');
    expect(issue?.code).toBe('invalid-path');
  });
});
