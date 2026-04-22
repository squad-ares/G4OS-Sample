import { createWriteStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { createLogger } from '@g4os/kernel/logger';
import type { Workspace } from '@g4os/kernel/types';
import archiver from 'archiver';
import {
  isPathSensitive,
  WORKSPACE_TRANSFER_FORMAT,
  WORKSPACE_TRANSFER_VERSION,
  type WorkspaceTransferManifest,
} from './transfer-manifest.ts';

const log = createLogger('workspace-transfer-export');

export interface ExportWorkspaceParams {
  readonly workspace: Workspace;
  readonly outputPath: string;
}

export interface ExportWorkspaceResult {
  readonly path: string;
  readonly sizeBytes: number;
  readonly filesIncluded: number;
}

export async function exportWorkspace(
  params: ExportWorkspaceParams,
): Promise<ExportWorkspaceResult> {
  const { workspace, outputPath } = params;

  const files = await listWorkspaceFiles(workspace.rootPath);

  const manifest: WorkspaceTransferManifest = {
    version: WORKSPACE_TRANSFER_VERSION,
    format: WORKSPACE_TRANSFER_FORMAT,
    exportedAt: Date.now(),
    workspaceId: workspace.id,
    workspaceSlug: workspace.slug,
    workspaceName: workspace.name,
    originalRootPath: workspace.rootPath,
    includesCredentials: false,
    filesCount: files.length,
  };

  const serializedWorkspace = {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    rootPath: workspace.rootPath,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    defaults: workspace.defaults,
    setupCompleted: workspace.setupCompleted,
    styleSetupCompleted: workspace.styleSetupCompleted,
    metadata: workspace.metadata,
  };

  return await new Promise<ExportWorkspaceResult>((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const out = createWriteStream(outputPath);

    out.on('close', () => {
      log.info(
        {
          workspaceId: workspace.id,
          path: outputPath,
          size: archive.pointer(),
          filesCount: files.length,
        },
        'workspace exported',
      );
      resolve({
        path: outputPath,
        sizeBytes: archive.pointer(),
        filesIncluded: files.length,
      });
    });
    out.on('error', reject);
    archive.on('error', reject);
    archive.pipe(out);

    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    archive.append(JSON.stringify(serializedWorkspace, null, 2), {
      name: 'workspace/config.json',
    });

    for (const file of files) {
      archive.file(file.absolutePath, { name: `workspace/files/${file.relativePath}` });
    }

    archive.finalize().catch(reject);
  });
}

interface WorkspaceFile {
  readonly absolutePath: string;
  readonly relativePath: string;
}

async function listWorkspaceFiles(rootPath: string): Promise<readonly WorkspaceFile[]> {
  const results: WorkspaceFile[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (err) {
      log.warn({ err, dir }, 'cannot read directory; skipping');
      return;
    }

    for (const entry of entries) {
      const full = join(dir, entry);
      const rel = relative(rootPath, full);
      if (isPathSensitive(rel)) continue;

      const info = await stat(full);
      if (info.isDirectory()) {
        await walk(full);
      } else if (info.isFile()) {
        results.push({ absolutePath: full, relativePath: rel.replace(/\\/g, '/') });
      }
    }
  }

  await walk(rootPath);
  return results;
}
