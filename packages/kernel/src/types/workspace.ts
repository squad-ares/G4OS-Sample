import type { z } from 'zod';
import type { WorkspaceSchema } from '../schemas/workspace.schema.ts';

export type Workspace = z.infer<typeof WorkspaceSchema>;
export type WorkspaceId = Workspace['id'];
