import type { ProjectTask, ProjectTaskStatus } from '@g4os/kernel/types';
import { Button, useTranslate } from '@g4os/ui';
import { Plus, X } from 'lucide-react';
import {
  type ProjectTaskGroup,
  TASK_PRIORITY_LABEL_KEYS,
  TASK_STATUS_LABEL_KEYS,
  TASK_STATUS_ORDER,
} from '../types.ts';

export interface ProjectTaskBoardProps {
  readonly tasks: readonly ProjectTask[];
  readonly onCreateTask?: (status: ProjectTaskStatus) => void;
  readonly onUpdateStatus?: (id: string, status: ProjectTaskStatus) => void;
  readonly onDeleteTask?: (id: string) => void;
  readonly onOpenTask?: (id: string) => void;
}

function groupTasks(tasks: readonly ProjectTask[]): readonly ProjectTaskGroup[] {
  return TASK_STATUS_ORDER.map((status) => ({
    status,
    labelKey: TASK_STATUS_LABEL_KEYS[status],
    tasks: tasks.filter((t) => t.status === status),
  }));
}

const PRIORITY_BADGES: Partial<Record<string, string>> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-slate-100 text-slate-600',
};

export function ProjectTaskBoard({
  tasks,
  onCreateTask,
  onUpdateStatus,
  onDeleteTask,
  onOpenTask,
}: ProjectTaskBoardProps) {
  const { t } = useTranslate();
  const groups = groupTasks(tasks);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {groups.map((group) => {
        const groupLabel = t(group.labelKey);
        return (
          <div key={group.status} className="flex w-64 flex-shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {groupLabel}
                <span className="ml-1.5 text-xs text-muted-foreground">({group.tasks.length})</span>
              </span>
              {onCreateTask && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() => onCreateTask(group.status)}
                  aria-label={t('project.task.newAriaLabel', { label: groupLabel })}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              )}
            </div>

            <div className="flex flex-col gap-2 min-h-[80px]">
              {group.tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  {...(onUpdateStatus ? { onUpdateStatus } : {})}
                  {...(onDeleteTask ? { onDelete: onDeleteTask } : {})}
                  {...(onOpenTask ? { onOpen: onOpenTask } : {})}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface TaskCardProps {
  readonly task: ProjectTask;
  readonly onUpdateStatus?: (id: string, status: ProjectTaskStatus) => void;
  readonly onDelete?: (id: string) => void;
  readonly onOpen?: (id: string) => void;
}

function TaskCard({ task, onUpdateStatus, onDelete, onOpen }: TaskCardProps) {
  const { t } = useTranslate();
  const priorityClass = task.priority ? (PRIORITY_BADGES[task.priority] ?? '') : '';

  return (
    <div className="group flex flex-col gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm hover:shadow">
      <div className="flex items-start justify-between gap-1">
        <button
          type="button"
          className="flex-1 truncate text-left leading-snug"
          onClick={() => onOpen?.(task.id)}
        >
          {task.title}
        </button>
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
          onClick={() => onDelete?.(task.id)}
          aria-label={t('project.task.deleteAriaLabel')}
        >
          <X className="h-3 w-3" />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {task.priority && (
          <span className={`rounded px-1.5 py-0.5 text-xs ${priorityClass}`}>
            {t(TASK_PRIORITY_LABEL_KEYS[task.priority])}
          </span>
        )}
        {onUpdateStatus && task.status !== 'done' && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline"
            onClick={() => {
              const next = nextStatus(task.status);
              if (next) onUpdateStatus(task.id, next);
            }}
          >
            {t('project.task.moveToNext', {
              label: t(TASK_STATUS_LABEL_KEYS[nextStatus(task.status) ?? 'done']),
            })}
          </button>
        )}
      </div>
    </div>
  );
}

function nextStatus(current: ProjectTaskStatus): ProjectTaskStatus | null {
  const idx = TASK_STATUS_ORDER.indexOf(current);
  const next = TASK_STATUS_ORDER[idx + 1];
  return next ?? null;
}
