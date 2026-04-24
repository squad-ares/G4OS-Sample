import type {
  WorkspaceExportSummary,
  WorkspaceImportSummary,
  WorkspacesService,
  WorkspaceTransferService as WorkspaceTransferServiceContract,
} from '@g4os/ipc/server';
import { AppError, ErrorCode } from '@g4os/kernel/errors';
import { createLogger } from '@g4os/kernel/logger';
import type { Workspace, WorkspaceId } from '@g4os/kernel/types';
import { err, ok, type Result } from 'neverthrow';
import { exportWorkspace } from './workspaces/transfer-export.ts';
import { extractWorkspaceFiles, readWorkspaceZip } from './workspaces/transfer-import.ts';
import type { WorkspaceTransferManifest } from './workspaces/transfer-manifest.ts';

const log = createLogger('workspace-transfer');

export interface WorkspaceTransferServiceDeps {
  readonly workspaces: WorkspacesService;
}

export function createWorkspaceTransferService(
  deps: WorkspaceTransferServiceDeps,
): WorkspaceTransferServiceContract {
  return {
    async exportWorkspace(input): Promise<Result<WorkspaceExportSummary, AppError>> {
      const workspaceResult = await deps.workspaces.get(input.workspaceId);
      if (workspaceResult.isErr()) return err(workspaceResult.error);

      try {
        const result = await exportWorkspace({
          workspace: workspaceResult.value,
          outputPath: input.outputPath,
        });
        return ok({
          path: result.path,
          sizeBytes: result.sizeBytes,
          filesIncluded: result.filesIncluded,
        });
      } catch (error) {
        log.error(
          { err: error, workspaceId: input.workspaceId, outputPath: input.outputPath },
          'workspace export failed',
        );
        return err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: 'failed to export workspace',
            context: { workspaceId: input.workspaceId, outputPath: input.outputPath },
            cause: error,
          }),
        );
      }
    },

    async importWorkspace(input): Promise<Result<WorkspaceImportSummary, AppError>> {
      try {
        const { manifest, workspaceConfig, files } = await readWorkspaceZip(input.zipPath);
        const { finalName, warnings } = await resolveImportedName(
          manifest,
          workspaceConfig,
          deps.workspaces,
        );

        const createResult = await deps.workspaces.create({ name: finalName, rootPath: '' });
        if (createResult.isErr()) return err(createResult.error);

        const fileWarnings = await applyImportedFiles(
          files,
          createResult.value,
          workspaceConfig,
          deps.workspaces,
        );
        return ok({
          workspaceId: createResult.value.id as WorkspaceId,
          warnings: [...warnings, ...fileWarnings],
        });
      } catch (error) {
        log.error({ err: error, zipPath: input.zipPath }, 'workspace import failed');
        return err(
          new AppError({
            code: ErrorCode.UNKNOWN_ERROR,
            message: 'failed to import workspace',
            context: { zipPath: input.zipPath },
            cause: error,
          }),
        );
      }
    },
  };
}

async function resolveImportedName(
  manifest: WorkspaceTransferManifest,
  workspaceConfig: Record<string, unknown>,
  workspaces: WorkspacesService,
): Promise<{ finalName: string; warnings: readonly string[] }> {
  const incomingName =
    typeof workspaceConfig['name'] === 'string'
      ? (workspaceConfig['name'] as string)
      : manifest.workspaceName;
  const existing = await workspaces.list();
  const slugInUse =
    existing.isOk() && existing.value.some((w) => w.slug === manifest.workspaceSlug);
  if (!slugInUse) return { finalName: incomingName, warnings: [] };
  return {
    finalName: `${incomingName} (importado)`,
    warnings: [`slug "${manifest.workspaceSlug}" already in use; imported workspace renamed`],
  };
}

async function applyImportedFiles(
  files: ReadonlyMap<string, Buffer>,
  created: Workspace,
  workspaceConfig: Record<string, unknown>,
  workspaces: WorkspacesService,
): Promise<readonly string[]> {
  const warnings: string[] = [];
  try {
    const extracted = await extractWorkspaceFiles(files, created.rootPath);
    log.info(
      { workspaceId: created.id, extracted, filesInZip: files.size },
      'workspace files extracted',
    );
  } catch (error) {
    log.error({ err: error, workspaceId: created.id }, 'file extraction failed');
    warnings.push('failed to extract some files; see main process logs');
  }
  const patch = buildImportPatch(workspaceConfig);
  if (patch) {
    const updateResult = await workspaces.update(created.id, patch);
    if (updateResult.isErr()) warnings.push('failed to restore workspace defaults/metadata');
  }
  return warnings;
}

function buildImportPatch(config: Record<string, unknown>): Partial<Workspace> | null {
  const patch: Partial<Workspace> = {};
  const defaults = config['defaults'];
  if (defaults && typeof defaults === 'object') {
    patch.defaults = defaults as Workspace['defaults'];
  }
  const metadata = config['metadata'];
  if (metadata && typeof metadata === 'object') {
    patch.metadata = metadata as Workspace['metadata'];
  }
  if (typeof config['setupCompleted'] === 'boolean') {
    patch.setupCompleted = config['setupCompleted'];
  }
  if (typeof config['styleSetupCompleted'] === 'boolean') {
    patch.styleSetupCompleted = config['styleSetupCompleted'];
  }
  return Object.keys(patch).length > 0 ? patch : null;
}
