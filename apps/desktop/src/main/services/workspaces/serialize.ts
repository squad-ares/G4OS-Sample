import type { Workspace, WorkspaceId } from '@g4os/kernel/types';

export interface WorkspaceRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly rootPath: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly metadata: string;
}

interface StoredDetails {
  readonly defaults: Workspace['defaults'];
  readonly setupCompleted: boolean;
  readonly styleSetupCompleted: boolean;
  readonly metadata: Workspace['metadata'];
}

export function serializeWorkspaceDetails(workspace: Workspace): string {
  const payload: StoredDetails = {
    defaults: workspace.defaults,
    setupCompleted: workspace.setupCompleted,
    styleSetupCompleted: workspace.styleSetupCompleted,
    metadata: workspace.metadata,
  };
  return JSON.stringify(payload);
}

export function deserializeWorkspaceRow(row: WorkspaceRow): Workspace {
  const parsed = JSON.parse(row.metadata) as Partial<StoredDetails>;

  const defaults: Workspace['defaults'] = {
    permissionMode: parsed.defaults?.permissionMode ?? 'ask',
    ...(parsed.defaults?.workingDirectory === undefined
      ? {}
      : { workingDirectory: parsed.defaults.workingDirectory }),
    ...(parsed.defaults?.projectsRootPath === undefined
      ? {}
      : { projectsRootPath: parsed.defaults.projectsRootPath }),
    ...(parsed.defaults?.llmConnectionSlug === undefined
      ? {}
      : { llmConnectionSlug: parsed.defaults.llmConnectionSlug }),
  };

  const metadata: Workspace['metadata'] = {
    ...(parsed.metadata?.iconId === undefined ? {} : { iconId: parsed.metadata.iconId }),
    ...(parsed.metadata?.theme === undefined ? {} : { theme: parsed.metadata.theme }),
    ...(parsed.metadata?.companyContextBound === undefined
      ? {}
      : { companyContextBound: parsed.metadata.companyContextBound }),
  };

  return {
    id: row.id as WorkspaceId,
    name: row.name,
    slug: row.slug,
    rootPath: row.rootPath,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    defaults,
    setupCompleted: parsed.setupCompleted ?? false,
    styleSetupCompleted: parsed.styleSetupCompleted ?? false,
    metadata,
  };
}
