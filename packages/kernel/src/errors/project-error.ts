import { AppError, type AppErrorOptions } from './app-error.ts';
import { ErrorCode } from './error-codes.ts';

/**
 * Erros tipados do domínio Projects. Mirrors `SessionError`/`CredentialError`
 * pattern: factories estáticas com código discriminado em `ErrorCode`.
 *
 * Adicionado em CR5-17 — antes, `apps/desktop/src/main/services/projects-service.ts`
 * construía `new AppError({ code: PROJECT_NOT_FOUND, ... })` direto, perdendo
 * type safety / consistência com outras error classes.
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
}
