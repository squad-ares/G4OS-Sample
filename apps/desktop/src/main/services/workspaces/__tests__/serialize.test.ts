import type { Workspace, WorkspaceId } from '@g4os/kernel/types';
import { describe, expect, it } from 'vitest';
import {
  deserializeWorkspaceRow,
  serializeWorkspaceDetails,
  type WorkspaceRow,
} from '../serialize.ts';

const BASE_ID = '11111111-2222-4333-8444-555555555555' as WorkspaceId;

const SAMPLE_WORKSPACE: Workspace = {
  id: BASE_ID,
  name: 'Acme',
  slug: 'acme',
  rootPath: '/tmp/workspaces/acme',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_001_000,
  defaults: { permissionMode: 'ask' },
  setupCompleted: false,
  styleSetupCompleted: false,
  metadata: {},
};

describe('workspace serialize roundtrip', () => {
  it('roundtrips defaults and flags through metadata JSON', () => {
    const withDetails: Workspace = {
      ...SAMPLE_WORKSPACE,
      defaults: {
        permissionMode: 'safe',
        workingDirectory: '/tmp/wd',
        projectsRootPath: '/tmp/wd/projects',
        llmConnectionSlug: 'claude-direct',
      },
      setupCompleted: true,
      styleSetupCompleted: true,
      metadata: { iconId: 'star', theme: '#f43f5e' },
    };

    const json = serializeWorkspaceDetails(withDetails);
    const row: WorkspaceRow = {
      id: withDetails.id,
      name: withDetails.name,
      slug: withDetails.slug,
      rootPath: withDetails.rootPath,
      createdAt: withDetails.createdAt,
      updatedAt: withDetails.updatedAt,
      metadata: json,
    };

    expect(deserializeWorkspaceRow(row)).toEqual(withDetails);
  });

  it('falls back to safe defaults when metadata is empty', () => {
    const row: WorkspaceRow = {
      id: BASE_ID,
      name: 'Acme',
      slug: 'acme',
      rootPath: '/tmp/workspaces/acme',
      createdAt: 1,
      updatedAt: 2,
      metadata: '{}',
    };

    const workspace = deserializeWorkspaceRow(row);
    expect(workspace.defaults.permissionMode).toBe('ask');
    expect(workspace.setupCompleted).toBe(false);
    expect(workspace.styleSetupCompleted).toBe(false);
    expect(workspace.metadata).toEqual({});
  });
});
