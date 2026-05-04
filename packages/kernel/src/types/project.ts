import type { z } from 'zod';
import type {
  LegacyProjectSchema,
  ProjectCreateInputSchema,
  ProjectIdSchema,
  ProjectPatchSchema,
  ProjectSchema,
  ProjectStatusSchema,
  ProjectTaskCreateInputSchema,
  ProjectTaskPatchSchema,
  ProjectTaskPrioritySchema,
  ProjectTaskSchema,
  ProjectTaskStatusSchema,
} from '../schemas/project.schema.ts';

export type ProjectId = z.infer<typeof ProjectIdSchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectCreateInput = z.infer<typeof ProjectCreateInputSchema>;
export type ProjectPatch = z.infer<typeof ProjectPatchSchema>;

export type ProjectTaskStatus = z.infer<typeof ProjectTaskStatusSchema>;
export type ProjectTaskPriority = z.infer<typeof ProjectTaskPrioritySchema>;
export type ProjectTask = z.infer<typeof ProjectTaskSchema>;
export type ProjectTaskId = ProjectTask['id'];
export type ProjectTaskCreateInput = z.infer<typeof ProjectTaskCreateInputSchema>;
export type ProjectTaskPatch = z.infer<typeof ProjectTaskPatchSchema>;

export interface ProjectFile {
  readonly relativePath: string;
  readonly size: number;
  readonly mtime: number;
  readonly mimeType: string;
  readonly canSync: boolean;
}

export type LegacyProject = z.infer<typeof LegacyProjectSchema>;
export type { LegacyImportDecision, LegacyImportEntry } from '../schemas/project.schema.ts';
