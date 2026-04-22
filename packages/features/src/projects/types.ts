import type {
  Project,
  ProjectFile,
  ProjectTask,
  ProjectTaskStatus,
  Session,
} from '@g4os/kernel/types';

export type { Project, ProjectFile, ProjectTask, ProjectTaskStatus };

export interface ProjectListItem {
  readonly id: Project['id'];
  readonly workspaceId: Project['workspaceId'];
  readonly name: Project['name'];
  readonly slug: Project['slug'];
  readonly description?: Project['description'];
  readonly color?: Project['color'];
  readonly status: Project['status'];
  readonly updatedAt: Project['updatedAt'];
}

export interface ProjectDetailView {
  readonly project: Project;
  readonly tasks: readonly ProjectTask[];
  readonly files: readonly ProjectFile[];
  readonly sessions: readonly Session[];
}

export type ProjectTaskGroup = {
  readonly status: ProjectTaskStatus;
  readonly label: string;
  readonly tasks: readonly ProjectTask[];
};

export const TASK_STATUS_LABELS: Record<ProjectTaskStatus, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  blocked: 'Bloqueado',
  done: 'Concluído',
};

export const TASK_STATUS_ORDER: ProjectTaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];
