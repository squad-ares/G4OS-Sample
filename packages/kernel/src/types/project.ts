import type { z } from 'zod';
import type {
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

export type LegacyImportDecision = 'import' | 'keep' | 'skip';

export interface LegacyProject {
  readonly path: string;
  readonly name: string;
  readonly slug: string;
  readonly existingId?: string | undefined;
  readonly description?: string | undefined;
  readonly inCanonicalRoot: boolean;
}

export interface LegacyImportEntry {
  readonly path: string;
  readonly name: string;
  readonly slug: string;
  readonly existingId?: string;
  readonly description?: string;
  readonly decision: LegacyImportDecision;
}
