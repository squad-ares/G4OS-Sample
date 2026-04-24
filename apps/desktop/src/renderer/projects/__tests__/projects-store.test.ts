import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  invalidateProjectDetail,
  invalidateProjects,
  legacyCheckKey,
  legacyDiscoverKey,
  projectDetailKey,
  projectFilesKey,
  projectSessionsKey,
  projectsListKey,
  projectTasksKey,
} from '../projects-store.ts';

vi.mock('../../ipc/trpc-client.ts', () => ({
  trpc: {
    projects: {
      list: { query: vi.fn().mockResolvedValue([]) },
      get: { query: vi.fn().mockResolvedValue(null) },
      listFiles: { query: vi.fn().mockResolvedValue([]) },
      listTasks: { query: vi.fn().mockResolvedValue([]) },
      listSessions: { query: vi.fn().mockResolvedValue([]) },
      hasLegacyImportDone: { query: vi.fn().mockResolvedValue(false) },
      discoverLegacyProjects: { query: vi.fn().mockResolvedValue([]) },
    },
  },
}));

const WS = 'workspace-uuid-1111-2222-3333-444444444444';
const PID = 'project--uuid-1111-2222-3333-444444444444';
const DIR = '/home/user/projects';

describe('projectsListKey', () => {
  it('returns stable tuple key', () => {
    expect(projectsListKey(WS)).toEqual(['projects', 'list', WS]);
  });
});

describe('projectDetailKey', () => {
  it('returns stable tuple key', () => {
    expect(projectDetailKey(PID)).toEqual(['projects', 'detail', PID]);
  });
});

describe('projectFilesKey', () => {
  it('returns stable tuple key', () => {
    expect(projectFilesKey(PID)).toEqual(['projects', 'files', PID]);
  });
});

describe('projectTasksKey', () => {
  it('returns stable tuple key', () => {
    expect(projectTasksKey(PID)).toEqual(['projects', 'tasks', PID]);
  });
});

describe('projectSessionsKey', () => {
  it('returns stable tuple key', () => {
    expect(projectSessionsKey(PID)).toEqual(['projects', 'sessions', PID]);
  });
});

describe('legacyCheckKey', () => {
  it('returns stable tuple key', () => {
    expect(legacyCheckKey(WS)).toEqual(['projects', 'legacy-check', WS]);
  });
});

describe('legacyDiscoverKey', () => {
  it('returns stable tuple key with workingDirectory', () => {
    expect(legacyDiscoverKey(WS, DIR)).toEqual(['projects', 'legacy-discover', WS, DIR]);
  });
});

describe('invalidateProjects', () => {
  it('invalidates all projects queries', async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    await invalidateProjects(qc);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['projects'] });
  });
});

describe('invalidateProjectDetail', () => {
  it('invalidates detail, files, tasks, and sessions queries', async () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue();
    await invalidateProjectDetail(qc, PID);
    expect(spy).toHaveBeenCalledWith({ queryKey: ['projects', 'detail', PID] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['projects', 'files', PID] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['projects', 'tasks', PID] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['projects', 'sessions', PID] });
  });
});
