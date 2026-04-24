import type { Workspace } from '@g4os/kernel/types';

export interface ValidationIssue {
  readonly field: 'name' | 'rootPath' | 'workingDirectory' | 'projectsRootPath';
  readonly code: 'required' | 'too-short' | 'too-long' | 'invalid-path';
  readonly messageKey: string;
}

export interface ValidateWorkspaceDefaultsInput {
  readonly name: string;
  readonly rootPath?: string;
  readonly defaults?: Partial<Workspace['defaults']>;
}

export function validateWorkspaceDefaults(
  input: ValidateWorkspaceDefaultsInput,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const trimmedName = input.name.trim();

  if (trimmedName.length === 0) {
    issues.push({
      field: 'name',
      code: 'required',
      messageKey: 'workspace.validation.name.required',
    });
  } else if (trimmedName.length < 2) {
    issues.push({
      field: 'name',
      code: 'too-short',
      messageKey: 'workspace.validation.name.tooShort',
    });
  } else if (trimmedName.length > 100) {
    issues.push({
      field: 'name',
      code: 'too-long',
      messageKey: 'workspace.validation.name.tooLong',
    });
  }

  const workingDir = input.defaults?.workingDirectory?.trim();
  if (workingDir !== undefined && workingDir.length > 0 && !isValidAbsolutePath(workingDir)) {
    issues.push({
      field: 'workingDirectory',
      code: 'invalid-path',
      messageKey: 'workspace.validation.workingDirectory.invalid',
    });
  }

  const projectsRoot = input.defaults?.projectsRootPath?.trim();
  if (projectsRoot !== undefined && projectsRoot.length > 0 && !isValidAbsolutePath(projectsRoot)) {
    issues.push({
      field: 'projectsRootPath',
      code: 'invalid-path',
      messageKey: 'workspace.validation.projectsRootPath.invalid',
    });
  }

  return issues;
}

function isValidAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}
