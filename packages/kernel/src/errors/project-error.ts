import { AppError, type AppErrorOptions } from './app-error.ts';
import { ErrorCode } from './error-codes.ts';

/**
 * Erros tipados do domínio Projects. Mirrors `SessionError`/`CredentialError`
 * pattern: factories estáticas com código discriminado em `ErrorCode`.
 *
 * Erros tipados do domínio Projects — consistência com `SessionError`/`CredentialError`.
 */
export class ProjectError extends AppError {
  constructor(
    options: Omit<AppErrorOptions, 'code'> & { code: Extract<ErrorCode, `project.${string}`> },
  ) {
    super(options);
    this.name = 'ProjectError';
  }

  static notFound(projectId: string): ProjectError {
    return new ProjectError({
      code: ErrorCode.PROJECT_NOT_FOUND,
      message: `project not found: ${projectId}`,
      context: { projectId },
    });
  }

  /**
   * UNIQUE index `idx_projects_workspace_slug` no DB — este error code permite
   * UI mostrar mensagem específica em vez de "unknown_error" do raw SQLite.
   */
  static slugConflict(workspaceId: string, slug: string): ProjectError {
    return new ProjectError({
      code: ErrorCode.PROJECT_SLUG_CONFLICT,
      message: `project slug already exists in workspace: ${slug}`,
      context: { workspaceId, slug },
    });
  }
}
