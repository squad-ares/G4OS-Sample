import type {
  Project,
  ProjectFile,
  ProjectTask,
  ProjectTaskStatus,
  Session,
} from '@g4os/kernel/types';
import type { TranslationKey } from '@g4os/translate';

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
  readonly labelKey: TranslationKey;
  readonly tasks: readonly ProjectTask[];
};

export const TASK_STATUS_LABEL_KEYS: Record<ProjectTaskStatus, TranslationKey> = {
  todo: 'project.task.status.todo',
  in_progress: 'project.task.status.in_progress',
  blocked: 'project.task.status.blocked',
  done: 'project.task.status.done',
};

export const TASK_PRIORITY_LABEL_KEYS: Record<
  NonNullable<ProjectTask['priority']>,
  TranslationKey
> = {
  urgent: 'project.task.priority.urgent',
  high: 'project.task.priority.high',
  medium: 'project.task.priority.medium',
  low: 'project.task.priority.low',
};

export const TASK_STATUS_ORDER: ProjectTaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];
