/**
 * PermissionStore — persistência de decisões `allow_always` do usuário
 * para tool calls. Arquivo `permissions.json` por workspace, escrita
 * atômica via write→rename.
 *
 * Modelo:
 *   - Cada decisão é chaveada por `(toolName, argsHash)`. `argsHash` é
 *     SHA-256 hex do `JSON.stringify` dos args ordenados — mesma tool com
 *     args diferentes pede permissão de novo.
 *   - `allow_session` NÃO persiste aqui — só vive em memória no broker
 *     enquanto a sessão está aberta.
 *   - Revogar apaga a entrada; próxima chamada volta a perguntar.
 *
 * Por que hash dos args: evita o usuário aprovar `run_bash("ls")` e o
 * agent depois rodar `run_bash("rm -rf /")` sem perguntar de novo.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createLogger } from '@g4os/kernel/logger';
import type { ToolPermissionDecision, ToolPermissionsFile } from '@g4os/kernel/schemas';
import { ToolPermissionsFileSchema } from '@g4os/kernel/schemas';

const log = createLogger('permission-store');
const FILE_NAME = 'permissions.json';

export type PersistedPermissionDecision = ToolPermissionDecision;

export interface PermissionStoreOptions {
  readonly resolveWorkspaceRoot: (workspaceId: string) => string;
}

export class PermissionStore {
  readonly #opts: PermissionStoreOptions;

  constructor(opts: PermissionStoreOptions) {
    this.#opts = opts;
  }

  async list(workspaceId: string): Promise<readonly PersistedPermissionDecision[]> {
    const file = await this.readFile(workspaceId);
    return file.decisions;
  }

  /**
   * Busca decisão matching `(toolName, argsHash)`. Aceita hashes legados de
   * 32 chars (pré-2026-04-24) comparando o prefixo do hash full-256.
   */
  async find(
    workspaceId: string,
    toolName: string,
    input: Readonly<Record<string, unknown>>,
  ): Promise<PersistedPermissionDecision | null> {
    const argsHash = hashArgs(input);
    const legacyHash = argsHash.slice(0, 32);
    const file = await this.readFile(workspaceId);
    return (
      file.decisions.find(
        (d) => d.toolName === toolName && (d.argsHash === argsHash || d.argsHash === legacyHash),
      ) ?? null
    );
  }

  async persist(
    workspaceId: string,
    input: { toolName: string; args: Readonly<Record<string, unknown>> },
  ): Promise<PersistedPermissionDecision> {
    const decision: PersistedPermissionDecision = {
      toolName: input.toolName,
      argsHash: hashArgs(input.args),
      argsPreview: previewArgs(input.args),
      decidedAt: Date.now(),
    };
    const file = await this.readFile(workspaceId);
    // Substitui existente com mesmo match OU insere novo
    const filtered = file.decisions.filter(
      (d) => !(d.toolName === decision.toolName && d.argsHash === decision.argsHash),
    );
    const next: ToolPermissionsFile = {
      version: 1,
      decisions: [...filtered, decision],
    };
    await this.writeFile(workspaceId, next);
    log.info(
      { workspaceId, toolName: decision.toolName, argsHash: decision.argsHash },
      'permission persisted (allow_always)',
    );
    return decision;
  }

  async revoke(workspaceId: string, toolName: string, argsHash: string): Promise<boolean> {
    const file = await this.readFile(workspaceId);
    const before = file.decisions.length;
    const next: ToolPermissionsFile = {
      version: 1,
      decisions: file.decisions.filter(
        (d) => !(d.toolName === toolName && d.argsHash === argsHash),
      ),
    };
    if (next.decisions.length === before) return false;
    await this.writeFile(workspaceId, next);
    return true;
  }

  async clearAll(workspaceId: string): Promise<number> {
    const file = await this.readFile(workspaceId);
    const count = file.decisions.length;
    if (count === 0) return 0;
    await this.writeFile(workspaceId, { version: 1, decisions: [] });
    return count;
  }

  private path(workspaceId: string): string {
    return join(this.#opts.resolveWorkspaceRoot(workspaceId), FILE_NAME);
  }

  private async readFile(workspaceId: string): Promise<ToolPermissionsFile> {
    try {
      const raw = await readFile(this.path(workspaceId), 'utf8');
      return ToolPermissionsFileSchema.parse(JSON.parse(raw));
    } catch (err) {
      if (isNotFound(err)) return { version: 1, decisions: [] };
      log.warn({ err, workspaceId }, 'failed to read permissions.json — treating as empty');
      return { version: 1, decisions: [] };
    }
  }

  private async writeFile(workspaceId: string, file: ToolPermissionsFile): Promise<void> {
    const path = this.path(workspaceId);
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(file, null, 2), 'utf8');
    await rename(tmp, path);
  }
}

/**
 * Hash full SHA-256 hex (64 chars). Usado como chave de decisão persistida —
 * truncar aumentava risco de colisão sem ganho. Arquivos `permissions.json`
 * de versões antigas podem ter hashes de 32 chars; o `find()` aceita ambos
 * os comprimentos (ver readFile) enquanto migramos, e novos writes sempre
 * usam 64.
 */
export function hashArgs(input: Readonly<Record<string, unknown>>): string {
  const stable = stableStringify(input);
  return createHash('sha256').update(stable).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

function previewArgs(input: Readonly<Record<string, unknown>>): string {
  const raw = JSON.stringify(input);
  return raw.length <= 200 ? raw : `${raw.slice(0, 197)}...`;
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'ENOENT'
  );
}
