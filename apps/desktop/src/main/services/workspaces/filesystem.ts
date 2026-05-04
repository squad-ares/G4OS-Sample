import { mkdir, rm } from 'node:fs/promises';
import { join, normalize, resolve, sep } from 'node:path';
import { BUNDLED_SKILLS, renderBundledSkill } from '@g4os/data/workspaces';
import { writeAtomic } from '@g4os/kernel/fs';

const SUBFOLDERS: readonly string[] = ['context', 'people', 'goals', 'projects'];

const AGENTS_BRIDGE = `# Workspace Context Bridge

Este workspace foi criado pelo G4 OS.

- Context compartilhado em \`context/\`
- Pessoas e stakeholders em \`people/\`
- Metas e briefings em \`goals/\`
- Projetos gerenciados em \`projects/\`

Para contexto de projeto específico, prefira os arquivos dentro de cada pasta em \`projects/\`.
`;

const CONTEXT_README = `# Context

Coloque aqui notas compartilhadas que várias sessões e projetos precisam consultar.
Prefira arquivos curtos, indexáveis e com títulos descritivos.
`;

const LABELS_CONFIG = {
  version: 1,
  groups: [
    {
      id: 'area',
      name: 'Área',
      color: '#3b82f6',
      labels: [
        { id: 'area-produto', name: 'Produto' },
        { id: 'area-engenharia', name: 'Engenharia' },
        { id: 'area-operacoes', name: 'Operações' },
      ],
    },
    {
      id: 'tipo',
      name: 'Tipo',
      color: '#f59e0b',
      labels: [
        { id: 'tipo-pesquisa', name: 'Pesquisa' },
        { id: 'tipo-decisao', name: 'Decisão' },
        { id: 'tipo-rotina', name: 'Rotina' },
      ],
    },
  ],
};

export async function bootstrapWorkspaceFilesystem(rootPath: string): Promise<void> {
  await mkdir(rootPath, { recursive: true });

  for (const sub of SUBFOLDERS) {
    await mkdir(join(rootPath, sub), { recursive: true });
  }

  // CR-33 F-CR33-7: writeAtomic em todos os bootstraps de workspace.
  // Idempotência ainda existe (re-bootstrap sobrescreve), mas partial-write em
  // `labels/config.json` (parseado em JSON) ou em qualquer doc compartilhada
  // levaria o user a deletar workspace e recriar. ADR-0050 propagado.
  await writeAtomic(join(rootPath, 'AGENTS.md'), AGENTS_BRIDGE);
  await writeAtomic(join(rootPath, 'CLAUDE.md'), AGENTS_BRIDGE);
  await writeAtomic(join(rootPath, 'context', 'README.md'), CONTEXT_README);
}

export async function seedDefaultLabels(rootPath: string): Promise<void> {
  const labelsDir = join(rootPath, 'labels');
  await mkdir(labelsDir, { recursive: true });
  // CR-33 F-CR33-7: writeAtomic — `config.json` é parseado em JSON pelos
  // consumers (`labels-service`); partial-write deixaria `JSON.parse` falhar.
  await writeAtomic(join(labelsDir, 'config.json'), `${JSON.stringify(LABELS_CONFIG, null, 2)}\n`);
}

/**
 * Planta as skills bundled (workspace-setup, onboarding-style-interview,
 * project-setup) em `<rootPath>/skills/<slug>/SKILL.md`. Idempotente —
 * sobrescreve só se conteúdo mudou (atualizações de skill via novas builds).
 */
export async function seedBundledSkills(rootPath: string): Promise<void> {
  const skillsRoot = join(rootPath, 'skills');
  await mkdir(skillsRoot, { recursive: true });
  for (const skill of BUNDLED_SKILLS) {
    const skillDir = join(skillsRoot, skill.slug);
    await mkdir(skillDir, { recursive: true });
    // CR-33 F-CR33-7: writeAtomic — idempotente (re-seed sobrescreve em novas
    // builds), mas partial-write em SKILL.md deixaria o agent lendo skill
    // truncada (front-matter cortado, instruções incompletas).
    await writeAtomic(join(skillDir, 'SKILL.md'), renderBundledSkill(skill));
  }
}

export interface CleanupOptions {
  readonly rootPath: string;
  /** Base path where managed workspaces live; rejects rm if rootPath is outside. */
  readonly managedRoot: string;
}

export async function cleanupWorkspaceFilesystem(options: CleanupOptions): Promise<void> {
  const normalizedRoot = normalize(resolve(options.rootPath));
  const normalizedManaged = normalize(resolve(options.managedRoot));

  if (!isPathInside(normalizedRoot, normalizedManaged)) {
    return;
  }

  await rm(normalizedRoot, { recursive: true, force: true });
}

function isPathInside(child: string, parent: string): boolean {
  const parentWithSep = parent.endsWith(sep) ? parent : `${parent}${sep}`;
  return child === parent || child.startsWith(parentWithSep);
}
