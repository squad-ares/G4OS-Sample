import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  discoverLegacyProjects,
  isDoneMarked,
  markDone,
  moveLegacyProject,
} from '../legacy-import.ts';

describe('discoverLegacyProjects()', () => {
  let root: string;
  const workspaceId = 'test-ws';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'g4os-legacy-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('retorna array vazio quando não há diretórios candidatos', async () => {
    const result = await discoverLegacyProjects({
      workspacesRootPath: root,
      workspaceId,
    });
    expect(result).toEqual([]);
  });

  it('retorna array vazio quando diretório existe mas não tem projects', async () => {
    const wsDir = join(root, workspaceId);
    await mkdir(wsDir, { recursive: true });
    const result = await discoverLegacyProjects({
      workspacesRootPath: root,
      workspaceId,
    });
    expect(result).toEqual([]);
  });

  it('descobre projetos com project.json no diretório padrão', async () => {
    const projDir = join(root, workspaceId, 'projects', 'my-project');
    await mkdir(projDir, { recursive: true });
    await writeFile(
      join(projDir, 'project.json'),
      JSON.stringify({ name: 'My Project', slug: 'my-project' }),
    );

    const result = await discoverLegacyProjects({
      workspacesRootPath: root,
      workspaceId,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('My Project');
    expect(result[0]?.slug).toBe('my-project');
  });

  it('usa o nome do diretório quando project.json não tem name', async () => {
    const projDir = join(root, workspaceId, 'projects', 'fallback-name');
    await mkdir(projDir, { recursive: true });
    await writeFile(join(projDir, 'project.json'), JSON.stringify({}));

    const result = await discoverLegacyProjects({
      workspacesRootPath: root,
      workspaceId,
    });

    expect(result[0]?.name).toBe('fallback-name');
    expect(result[0]?.slug).toBe('fallback-name');
  });

  it('descobre projetos de workingDirectory/projects quando fornecido', async () => {
    const wdRoot = join(root, 'working-dir');
    const projDir = join(wdRoot, 'projects', 'wd-project');
    await mkdir(projDir, { recursive: true });
    await writeFile(join(projDir, 'project.json'), JSON.stringify({ name: 'WD Project' }));

    const result = await discoverLegacyProjects({
      workspacesRootPath: root,
      workspaceId,
      workingDirectory: wdRoot,
    });

    expect(result.some((p) => p.name === 'WD Project')).toBe(true);
  });

  it('descobre projetos de workingDirectory/projetos (variante pt-BR)', async () => {
    const wdRoot = join(root, 'working-dir2');
    const projDir = join(wdRoot, 'projetos', 'pt-project');
    await mkdir(projDir, { recursive: true });
    await writeFile(join(projDir, 'project.json'), JSON.stringify({ name: 'PT Project' }));

    const result = await discoverLegacyProjects({
      workspacesRootPath: root,
      workspaceId,
      workingDirectory: wdRoot,
    });

    expect(result.some((p) => p.name === 'PT Project')).toBe(true);
  });

  it('não duplica projetos quando o mesmo path aparece em múltiplos candidatos', async () => {
    const sharedDir = join(root, workspaceId, 'projects');
    const projDir = join(sharedDir, 'shared-project');
    await mkdir(projDir, { recursive: true });
    await writeFile(join(projDir, 'project.json'), JSON.stringify({ name: 'Shared' }));

    // workingDirectory aponta para o mesmo root que wsRoot/projects
    const result = await discoverLegacyProjects({
      workspacesRootPath: root,
      workspaceId,
      workingDirectory: join(root, workspaceId),
    });

    const names = result.map((p) => p.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('ignora subdiretórios sem project.json', async () => {
    const projDir = join(root, workspaceId, 'projects', 'no-meta');
    await mkdir(projDir, { recursive: true });
    await writeFile(join(projDir, 'README.md'), 'not a project');

    const result = await discoverLegacyProjects({
      workspacesRootPath: root,
      workspaceId,
    });

    expect(result).toHaveLength(0);
  });

  it('preserva existingId quando project.json tem id', async () => {
    const projDir = join(root, workspaceId, 'projects', 'with-id');
    await mkdir(projDir, { recursive: true });
    await writeFile(
      join(projDir, 'project.json'),
      JSON.stringify({ id: 'existing-uuid', name: 'With ID' }),
    );

    const result = await discoverLegacyProjects({
      workspacesRootPath: root,
      workspaceId,
    });

    expect(result[0]?.existingId).toBe('existing-uuid');
  });
});

describe('isDoneMarked() / markDone()', () => {
  let root: string;
  const workspaceId = 'ws-sentinel';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'g4os-sentinel-'));
    await mkdir(join(root, workspaceId), { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('retorna false quando sentinel não existe', () => {
    expect(isDoneMarked(root, workspaceId)).toBe(false);
  });

  it('retorna true após markDone()', async () => {
    await markDone(root, workspaceId);
    expect(isDoneMarked(root, workspaceId)).toBe(true);
  });

  it('sentinel contém timestamp ISO', async () => {
    await markDone(root, workspaceId);
    const content = await readFile(join(root, workspaceId, '.legacy-import-done'), 'utf-8');
    expect(() => new Date(content)).not.toThrow();
    expect(isNaN(new Date(content).getTime())).toBe(false);
  });
});

describe('moveLegacyProject()', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'g4os-move-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('move diretório de origem para destino', async () => {
    const from = join(root, 'source-project');
    const to = join(root, 'dest', 'moved-project');
    await mkdir(from, { recursive: true });
    await writeFile(join(from, 'project.json'), JSON.stringify({ name: 'Test' }));

    await moveLegacyProject(from, to);

    expect(existsSync(from)).toBe(false);
    expect(existsSync(to)).toBe(true);
    expect(existsSync(join(to, 'project.json'))).toBe(true);
  });

  it('lança erro quando destino já existe', async () => {
    const from = join(root, 'src');
    const to = join(root, 'dst');
    await mkdir(from, { recursive: true });
    await mkdir(to, { recursive: true });

    await expect(moveLegacyProject(from, to)).rejects.toThrow('target already exists');
  });
});
