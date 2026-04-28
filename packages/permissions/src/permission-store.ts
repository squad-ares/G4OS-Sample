/**
 * PermissionStore — persistência de decisões `allow_always` do usuário
 * para tool calls. Arquivo `permissions.json` por workspace, escrita
 * atômica via `writeAtomic` (`tmp → fsync → rename → fsync(dir)`) +
 * mutex per-workspace para serializar persist/revoke concorrentes.
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
import { mkdir, readFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { writeAtomic } from '@g4os/kernel/fs';
import { createLogger } from '@g4os/kernel/logger';
import type { ToolPermissionDecision, ToolPermissionsFile } from '@g4os/kernel/schemas';
import { ToolPermissionsFileSchema } from '@g4os/kernel/schemas';

const log = createLogger('permission-store');
const FILE_NAME = 'permissions.json';

export type PersistedPermissionDecision = ToolPermissionDecision;

export interface PermissionStoreOptions {
  readonly resolveWorkspaceRoot: (workspaceId: string) => string;
}

/**
 * Timeout default para `withLock`. Operações de I/O (readFile + writeAtomic)
 * em workspace local devem completar bem antes disso. Timeout existe para
 * defender contra disk hung / FS corrompido — sem ele, leituras subsequentes
 * ficam bloqueadas indefinidamente (CR4-09).
 */
const DEFAULT_LOCK_TIMEOUT_MS = 5000;

export class PermissionStore {
  readonly #opts: PermissionStoreOptions;
  readonly #lockTimeoutMs: number;
  /** Mutex per-workspace serializa read-modify-write para `permissions.json`. */
  readonly #locks = new Map<string, Promise<unknown>>();

  constructor(opts: PermissionStoreOptions & { readonly lockTimeoutMs?: number }) {
    this.#opts = opts;
    this.#lockTimeoutMs = opts.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
  }

  private withLock<T>(workspaceId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.#locks.get(workspaceId) ?? Promise.resolve();
    const timeoutMs = this.#lockTimeoutMs;
    // CR5-10: race entre `setTimeout` firing e `clearTimeout` no error
    // path. Sem `timedOut` flag, fn que rejeita mais ou menos no mesmo
    // tick que o timeout dispara podia liberar lock incorretamente.
    // Sentinel local distingue: se timedOut, a Promise já foi rejeitada
    // e qualquer resolve/reject posterior de fn é ignorado.
    const guarded = (): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        let timedOut = false;
        const handle = setTimeout(() => {
          timedOut = true;
          reject(new Error(`PermissionStore lock timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        handle.unref?.();
        fn().then(
          (value) => {
            if (timedOut) return;
            clearTimeout(handle);
            resolve(value);
          },
          (err: unknown) => {
            if (timedOut) return;
            clearTimeout(handle);
            reject(err);
          },
        );
      });
    const next = previous.then(guarded, guarded);
    this.#locks.set(
      workspaceId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  list(workspaceId: string): Promise<readonly PersistedPermissionDecision[]> {
    // Lê dentro do withLock para enxergar sempre o último write commitado.
    // Sem o lock, list() concorrente com persist()/revoke() podia retornar
    // snapshot pré-rename — o `writeAtomic` é atômico no FS, mas a leitura
    // pode ocorrer antes do rename, devolvendo state obsoleto ao caller.
    return this.withLock(workspaceId, async () => {
      const file = await this.readFile(workspaceId);
      return file.decisions;
    });
  }

  /**
   * Busca decisão matching `(toolName, argsHash)`. Aceita hashes legados de
   * 32 chars (pré-2026-04-24) comparando o prefixo do hash full-256.
   *
   * Lê dentro do withLock para garantir leitura post-write commitado.
   */
  find(
    workspaceId: string,
    toolName: string,
    input: Readonly<Record<string, unknown>>,
  ): Promise<PersistedPermissionDecision | null> {
    return this.withLock(workspaceId, async () => {
      const argsHash = hashArgs(input);
      const legacyHash = argsHash.slice(0, 32);
      const file = await this.readFile(workspaceId);
      return (
        file.decisions.find(
          (d) => d.toolName === toolName && (d.argsHash === argsHash || d.argsHash === legacyHash),
        ) ?? null
      );
    });
  }

  persist(
    workspaceId: string,
    input: { toolName: string; args: Readonly<Record<string, unknown>> },
  ): Promise<PersistedPermissionDecision> {
    return this.withLock(workspaceId, async () => {
      const decision: PersistedPermissionDecision = {
        toolName: input.toolName,
        argsHash: hashArgs(input.args),
        argsPreview: previewArgs(input.args),
        decidedAt: Date.now(),
      };
      const legacyHash = decision.argsHash.slice(0, 32);
      const file = await this.readFile(workspaceId);
      // CR4-18: substitui existente com hash full (64-char) E também
      // remove entry legacy (32-char) com mesmo prefixo. Sem isso o
      // arquivo acumulava bloat de decisões antigas duplicadas.
      const filtered = file.decisions.filter(
        (d) =>
          !(
            d.toolName === decision.toolName &&
            (d.argsHash === decision.argsHash || d.argsHash === legacyHash)
          ),
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
    });
  }

  revoke(workspaceId: string, toolName: string, argsHash: string): Promise<boolean> {
    return this.withLock(workspaceId, async () => {
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
    });
  }

  clearAll(workspaceId: string): Promise<number> {
    return this.withLock(workspaceId, async () => {
      const file = await this.readFile(workspaceId);
      const count = file.decisions.length;
      if (count === 0) return 0;
      await this.writeFile(workspaceId, { version: 1, decisions: [] });
      return count;
    });
  }

  private path(workspaceId: string): string {
    return join(this.#opts.resolveWorkspaceRoot(workspaceId), FILE_NAME);
  }

  private async readFile(workspaceId: string): Promise<ToolPermissionsFile> {
    const path = this.path(workspaceId);
    try {
      const raw = await readFile(path, 'utf8');
      return ToolPermissionsFileSchema.parse(JSON.parse(raw));
    } catch (err) {
      if (isNotFound(err)) return { version: 1, decisions: [] };
      // CR7-27: distinguir parse failure (corruption) de IO error e
      // PRESERVAR o arquivo corrompido como `.corrupt.<ts>` antes de tratar
      // como vazio. Sem isso, o próximo `persist()` sobrescrevia silentemente
      // — operador perdia dados sem rastreabilidade. Operação é best-effort:
      // se o rename falhar (disk-full?), seguimos com warn.
      const corruptPath = `${path}.corrupt.${Date.now()}`;
      try {
        await rename(path, corruptPath);
        log.warn(
          { err, workspaceId, corruptPath },
          'permissions.json parse failed; corrupt file preserved as .corrupt.<ts>',
        );
      } catch (renameErr) {
        log.warn(
          { err, renameErr, workspaceId },
          'failed to backup corrupt permissions.json; treating as empty',
        );
      }
      return { version: 1, decisions: [] };
    }
  }

  private async writeFile(workspaceId: string, file: ToolPermissionsFile): Promise<void> {
    const path = this.path(workspaceId);
    await mkdir(dirname(path), { recursive: true });
    await writeAtomic(path, JSON.stringify(file, null, 2));
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

function stableStringify(value: unknown, visited: WeakSet<object> = new WeakSet()): string {
  // CR6-17: BigInt não tem `JSON.stringify` builtin (lança `TypeError`).
  // Tools analíticas legítimas podem passar BigInt — converter para string
  // mantém o hash determinístico sem crashar o broker.
  if (typeof value === 'bigint') return JSON.stringify(`${value}n`);
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  // CR5-11: rejeita ciclos antes de recursar — sem este guard, args com
  // referência circular (`args.self = args`) faz stack overflow e crash
  // o broker. DoS vector em single tool call malformado.
  if (visited.has(value as object)) {
    throw new Error('hashArgs: circular reference in tool args');
  }
  visited.add(value as object);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item, visited)).join(',')}]`;
  }
  // CR6-17: `Reflect.ownKeys` cobre Symbol keys também — `Object.keys` os
  // ignora silenciosamente, então duas chamadas com Symbol keys diferentes
  // produziriam o mesmo hash (colisão). Filtramos Symbols porque tornar
  // chave-Symbol estável JSON é ambíguo (sem identidade serializável).
  const allKeys = Reflect.ownKeys(value as object).filter(
    (k): k is string => typeof k === 'string',
  );
  // CR9: ordem ordinal (UTF-16 code units) em vez de `localeCompare`. O
  // hash de args precisa ser determinístico ENTRE máquinas — `localeCompare`
  // varia com collation do locale (pt-BR, en-US, etc.), então usuários em
  // locales diferentes geravam hashes ligeiramente distintos para o mesmo
  // input. Comparação ordinal é estável em qualquer ambiente.
  const entries = allKeys
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((k) => [k, (value as Record<string, unknown>)[k]] as const);
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v, visited)}`).join(',')}}`;
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
