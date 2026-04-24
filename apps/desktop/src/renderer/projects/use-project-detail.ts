import type {
  Project,
  ProjectFile,
  ProjectPatch,
  ProjectTask,
  ProjectTaskCreateInput,
  ProjectTaskPatch,
  ProjectTaskStatus,
  Session,
} from '@g4os/kernel/types';
import { toast } from '@g4os/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryClient } from '../ipc/query-client.ts';
import { trpc } from '../ipc/trpc-client.ts';
import {
  invalidateProjectDetail,
  projectDetailQueryOptions,
  projectFilesQueryOptions,
  projectSessionsQueryOptions,
  projectTasksQueryOptions,
} from './projects-store.ts';

export interface ProjectDetailState {
  readonly project: Project | undefined;
  readonly files: readonly ProjectFile[];
  readonly tasks: readonly ProjectTask[];
  readonly sessions: readonly Session[];
  readonly isLoading: boolean;
  readonly readFile: (relativePath: string) => Promise<string>;
  readonly saveFile: (relativePath: string, content: string) => Promise<void>;
  readonly deleteFile: (relativePath: string) => Promise<void>;
  readonly createTask: (status: ProjectTaskStatus) => Promise<void>;
  readonly updateTask: (id: string, patch: ProjectTaskPatch) => Promise<void>;
  readonly updateTaskStatus: (id: string, status: ProjectTaskStatus) => void;
  readonly deleteTask: (id: string) => void;
  readonly updateProject: (patch: ProjectPatch) => Promise<void>;
}

export function useProjectDetail(projectId: string): ProjectDetailState {
  const detailQuery = useQuery(projectDetailQueryOptions(projectId));
  const filesQuery = useQuery(projectFilesQueryOptions(projectId));
  const tasksQuery = useQuery(projectTasksQueryOptions(projectId));
  const sessionsQuery = useQuery(projectSessionsQueryOptions(projectId));

  const invalidate = useCallback(
    () => invalidateProjectDetail(queryClient, projectId),
    [projectId],
  );

  const updateProjectMutation = useMutation({
    mutationFn: (patch: ProjectPatch) => trpc.projects.update.mutate({ id: projectId, patch }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(String(err)),
  });

  const saveFileMutation = useMutation({
    mutationFn: ({ relativePath, content }: { relativePath: string; content: string }) =>
      trpc.projects.saveFile.mutate({ projectId, relativePath, content }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(String(err)),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (relativePath: string) =>
      trpc.projects.deleteFile.mutate({ projectId, relativePath }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(String(err)),
  });

  const createTaskMutation = useMutation({
    mutationFn: (input: ProjectTaskCreateInput) => trpc.projects.createTask.mutate(input),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(String(err)),
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ProjectTaskPatch }) =>
      trpc.projects.updateTask.mutate({ id, patch }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(String(err)),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => trpc.projects.deleteTask.mutate({ id }),
    onSuccess: () => invalidate(),
    onError: (err) => toast.error(String(err)),
  });

  return {
    project: detailQuery.data,
    files: filesQuery.data ?? [],
    tasks: tasksQuery.data ?? [],
    sessions: sessionsQuery.data ?? [],
    isLoading:
      detailQuery.isLoading ||
      filesQuery.isLoading ||
      tasksQuery.isLoading ||
      sessionsQuery.isLoading,
    readFile: async (relativePath) => {
      const content = await trpc.projects.getFileContent.query({ projectId, relativePath });
      return content;
    },
    saveFile: async (relativePath, content) => {
      await saveFileMutation.mutateAsync({ relativePath, content });
    },
    deleteFile: async (relativePath) => {
      await deleteFileMutation.mutateAsync(relativePath);
    },
    createTask: async (status) => {
      await createTaskMutation.mutateAsync({
        projectId,
        title: 'New task',
        status,
      });
    },
    updateTask: async (id, patch) => {
      await updateTaskMutation.mutateAsync({ id, patch });
    },
    updateTaskStatus: (id, status) => {
      void updateTaskMutation.mutateAsync({ id, patch: { status } });
    },
    deleteTask: (id) => {
      void deleteTaskMutation.mutateAsync(id);
    },
    updateProject: async (patch) => {
      await updateProjectMutation.mutateAsync(patch);
    },
  };
}
