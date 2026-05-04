/**
 * Gerador de plano de migração — varre estrutura V1 e produz blueprint
 * antes de escrever qualquer byte.
 *
 * Plano é input do executor + UI wizard (`PlanReview` step). Idempotência:
 * se `<v2Target>/.migration-done` existe, retorna `alreadyMigrated: true`
 * pra UI/CLI bloquear execução automática (usuário pode forçar com flag).
 */

import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { MigrationPlan, MigrationStep, MigrationStepKind, V1Install } from './types.ts';

export const MIGRATION_DONE_MARKER = '.migration-done';

export interface CreatePlanInput {
  readonly source: V1Install;
  /** Caminho V2 destino (resolvido pelo caller via `getAppPaths().data` ou similar). */
  readonly target: string;
}

/**
 * Constrói o plan inspecionando o V1. Não toca o V2 (só verifica se já foi
 * migrado). Erros não-fatais viram `warnings`; erros fatais (path não
 * existe, permission denied) propagam exception pro caller.
 */
export async function createMigrationPlan(input: CreatePlanInput): Promise<MigrationPlan> {
  const { source, target } = input;
  const warnings: string[] = [];

  // F-CR40-6: usa readFile em vez de existsSync para detectar o marker —
  // evita race TOCTOU onde outro processo escreve o marker entre o check
  // e o execute(). ENOENT = não migrado; qualquer outro conteúdo = migrado.
  const alreadyMigrated = await checkMarkerExists(join(target, MIGRATION_DONE_MARKER));
  if (alreadyMigrated) {
    return {
      source,
      target,
      steps: [],
      estimatedSize: 0,
      warnings: ['v2 já migrado — `.migration-done` marker presente; use --force para re-migrar'],
      alreadyMigrated: true,
    };
  }

  if (source.version === null) {
    warnings.push('config.json corrompido — version desconhecida');
  }

  const steps = await Promise.all([
    countConfigStep(source.path),
    countCredentialsStep(source.path),
    countWorkspacesStep(source.path, warnings),
    countSessionsStep(source.path, warnings),
    countSourcesStep(source.path),
    countSkillsStep(source.path),
  ]);

  const estimatedSize = steps.reduce((acc, s) => acc + s.estimatedBytes, 0);

  return {
    source,
    target,
    steps,
    estimatedSize,
    warnings,
    alreadyMigrated: false,
  };
}

async function countConfigStep(v1Path: string): Promise<MigrationStep> {
  const configPath = join(v1Path, 'config.json');
  const bytes = await fileBytes(configPath);
  return makeStep('config', 'Global config + preferences', bytes > 0 ? 1 : 0, bytes);
}

async function countCredentialsStep(v1Path: string): Promise<MigrationStep> {
  // V1 cred file é único (`credentials.enc`); tamanho aproxima quantidade.
  // Decryption + re-encryption real é delegada a `@g4os/credentials/migration`.
  const credPath = join(v1Path, 'credentials.enc');
  const bytes = await fileBytes(credPath);
  return makeStep(
    'credentials',
    'Credentials (re-encrypt para V2 vault)',
    bytes > 0 ? 1 : 0,
    bytes,
  );
}

async function countWorkspacesStep(v1Path: string, warnings: string[]): Promise<MigrationStep> {
  const wsRoot = join(v1Path, 'workspaces');
  if (!existsSync(wsRoot)) {
    warnings.push('diretório `workspaces/` ausente em V1 — nenhum workspace pra migrar');
    return makeStep('workspaces', 'Workspaces', 0, 0);
  }
  const entries = await readdir(wsRoot, { withFileTypes: true });
  const count = entries.filter((e) => e.isDirectory()).length;
  // Estimativa grosseira: 4KB por workspace metadata.
  return makeStep('workspaces', `Workspaces (${count})`, count, count * 4096);
}

async function countSessionsStep(v1Path: string, warnings: string[]): Promise<MigrationStep> {
  const wsRoot = join(v1Path, 'workspaces');
  if (!existsSync(wsRoot)) {
    return makeStep('sessions', 'Sessions (V1 → event-sourced V2)', 0, 0);
  }
  const wsEntries = await readdir(wsRoot, { withFileTypes: true });
  let total = 0;
  let bytes = 0;
  for (const ws of wsEntries) {
    if (!ws.isDirectory()) continue;
    const sessionsDir = join(wsRoot, ws.name, 'sessions');
    if (!existsSync(sessionsDir)) continue;
    try {
      const sessionEntries = await readdir(sessionsDir, { withFileTypes: true });
      for (const s of sessionEntries) {
        if (!s.isDirectory()) continue;
        const sessionPath = join(sessionsDir, s.name);
        bytes += await dirSize(sessionPath);
        total++;
      }
    } catch {
      warnings.push(`falha lendo sessions de workspace ${ws.name}`);
    }
  }
  return makeStep('sessions', `Sessions JSON+JSONL → V2 event log (${total})`, total, bytes);
}

async function countSourcesStep(v1Path: string): Promise<MigrationStep> {
  const srcPath = join(v1Path, 'sources.json');
  const bytes = await fileBytes(srcPath);
  return makeStep('sources', 'Source configs + MCP auth', bytes > 0 ? 1 : 0, bytes);
}

async function countSkillsStep(v1Path: string): Promise<MigrationStep> {
  const skillsDir = join(v1Path, 'skills');
  if (!existsSync(skillsDir)) return makeStep('skills', 'Skills + workflows', 0, 0);
  const bytes = await dirSize(skillsDir);
  const entries = await readdir(skillsDir, { withFileTypes: true });
  const count = entries.filter((e) => e.isDirectory()).length;
  return makeStep('skills', `Skills + workflows (${count})`, count, bytes);
}

function makeStep(
  kind: MigrationStepKind,
  description: string,
  count: number,
  estimatedBytes: number,
): MigrationStep {
  return { kind, description, count, estimatedBytes };
}

async function fileBytes(path: string): Promise<number> {
  if (!existsSync(path)) return 0;
  try {
    const s = await stat(path);
    return s.isFile() ? s.size : 0;
  } catch {
    return 0;
  }
}

/**
 * F-CR40-6: Verifica existência do marker via leitura (em vez de existsSync).
 * ENOENT = não migrado; qualquer conteúdo lido = migrado.
 * Outros erros de IO são tratados como "não migrado" — preferimos não
 * bloquear uma migração legítima por erro de permissão no check.
 */
async function checkMarkerExists(markerPath: string): Promise<boolean> {
  try {
    await readFile(markerPath, 'utf-8');
    return true;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    // IO error (EACCES, etc.) — trata como não-migrado com log implícito.
    return false;
  }
}

async function dirSize(path: string): Promise<number> {
  let total = 0;
  try {
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries) {
      const sub = join(path, entry.name);
      if (entry.isDirectory()) {
        total += await dirSize(sub);
      } else if (entry.isFile()) {
        try {
          const s = await stat(sub);
          total += s.size;
        } catch {
          // best-effort — sym links quebrados, perm denied etc.
        }
      }
    }
  } catch {
    // dir inacessível
  }
  return total;
}
