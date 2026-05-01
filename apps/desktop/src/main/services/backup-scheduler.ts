import { mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type AppDb,
  type AttachmentGateway,
  type AttachmentStorage,
  exportWorkspaceBackup,
  workspaces,
} from '@g4os/data';
import { DisposableBase, type IDisposable, toDisposable } from '@g4os/kernel/disposable';
import { createLogger } from '@g4os/kernel/logger';
import { getAppPaths } from '@g4os/platform';

const log = createLogger('backup-scheduler');

const DAY_MS = 24 * 3600 * 1000;
const DEFAULT_INTERVAL_MS = DAY_MS;
const DEFAULT_RETENTION = { daily: 7, weekly: 4, monthly: 3 } as const;

export interface BackupSchedulerOptions {
  readonly db: AppDb;
  readonly storage: AttachmentStorage;
  readonly gateway: AttachmentGateway;
  /** Diretório base para os backups. Default: `<data>/auto-backups`. */
  readonly outputDir?: string;
  /** Intervalo entre ciclos. Default: 24h. */
  readonly intervalMs?: number;
  /** Versão do app (vai para manifest). */
  readonly appVersion?: string;
  /** Política de retenção. Default: 7/4/3. */
  readonly retention?: { daily: number; weekly: number; monthly: number };
  /** Resolve o diretório `sessions/` de um workspace. Default: platform paths. */
  readonly workspaceRoot?: (workspaceId: string) => string;
}

export class BackupScheduler extends DisposableBase {
  private readonly outputDir: string;
  private readonly intervalMs: number;
  private readonly retention: { daily: number; weekly: number; monthly: number };
  private readonly workspaceRootOf: (id: string) => string;
  private running = false;

  constructor(private readonly options: BackupSchedulerOptions) {
    super();
    this.outputDir = options.outputDir ?? join(getAppPaths().data, 'auto-backups');
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.retention = options.retention ?? DEFAULT_RETENTION;
    this.workspaceRootOf = options.workspaceRoot ?? ((id) => getAppPaths().workspace(id));
  }

  start(): IDisposable {
    const timer = setInterval(() => {
      void this.runOnce().catch((err) => log.error({ err }, 'backup cycle failed'));
    }, this.intervalMs);
    // ADR-0032 graceful shutdown 5s. Sem unref, timer mantém process
    // vivo mesmo após sinal de quit se dispose ainda não foi acionado.
    timer.unref?.();
    const disposer = this._register(toDisposable(() => clearInterval(timer)));
    return disposer;
  }

  async runOnce(): Promise<void> {
    if (this.running) {
      log.warn('backup cycle already running — skipping');
      return;
    }
    this.running = true;
    try {
      await mkdir(this.outputDir, { recursive: true });
      const rows = this.options.db.select({ id: workspaces.id }).from(workspaces).all();
      for (const { id } of rows) {
        try {
          await this.backupWorkspace(id);
        } catch (err) {
          log.error({ err, workspaceId: id }, 'workspace backup failed');
        }
      }
      await this.prune();
    } finally {
      this.running = false;
    }
  }

  /**
   * Aguarda ciclo em-voo terminar com timeout. Caller deve invocar antes
   * de `dispose()` no shutdown — sem isso, `clearInterval` para o timer
   * mas `runOnce` continua escrevendo ZIP em background, podendo deixar
   * arquivo parcial se processo morre antes do `archive.finalize()`.
   *
   * Retorna `true` se ciclo terminou dentro do timeout, `false` se
   * timed out (caller pode escolher kill mesmo assim — tradeoff vs
   * janela de shutdown da Electron de 5s).
   */
  async drain(timeoutMs = 2000): Promise<boolean> {
    if (!this.running) return true;
    const start = Date.now();
    while (this.running && Date.now() - start < timeoutMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    return !this.running;
  }

  private async backupWorkspace(workspaceId: string): Promise<void> {
    await this.runForWorkspace(workspaceId);
  }

  /**
   * Roda backup de um único workspace fora do ciclo periódico (manual via
   * `Settings > Backup > Run now`). Cria `outputDir` se ausente, devolve
   * o path absoluto do ZIP gerado.
   */
  async runForWorkspace(
    workspaceId: string,
  ): Promise<{ readonly path: string; readonly sizeBytes: number }> {
    await mkdir(this.outputDir, { recursive: true });
    const outputPath = join(this.outputDir, `${workspaceId}-${Date.now()}.zip`);
    const result = await exportWorkspaceBackup({
      workspaceId,
      db: this.options.db,
      storage: this.options.storage,
      gateway: this.options.gateway,
      workspaceRoot: this.workspaceRootOf(workspaceId),
      outputPath,
      ...(this.options.appVersion ? { appVersion: this.options.appVersion } : {}),
    });
    log.info(
      { workspaceId, outputPath, size: result.size, sessionsCount: result.sessionsCount },
      'workspace backup created',
    );
    return { path: outputPath, sizeBytes: result.size };
  }

  /** Diretório onde os ZIPs são gravados. UI usa pra `showItemInFolder`. */
  get backupDir(): string {
    return this.outputDir;
  }

  private async prune(): Promise<void> {
    const entries = await readdir(this.outputDir);
    const groups = groupBackupsByWorkspace(entries, this.outputDir);
    for (const list of groups.values()) {
      await this.pruneGroup(list);
    }
  }

  private async pruneGroup(list: BackupEntry[]): Promise<void> {
    list.sort((a, b) => b.ts - a.ts);
    const keep = new Set<string>();
    for (const b of list.slice(0, this.retention.daily)) keep.add(b.path);
    for (const b of pickByBucket(list, DAY_MS * 7, this.retention.weekly)) keep.add(b.path);
    for (const b of pickByBucket(list, DAY_MS * 30, this.retention.monthly)) keep.add(b.path);

    for (const b of list) {
      if (keep.has(b.path)) continue;
      try {
        await unlink(b.path);
        log.debug({ path: b.path }, 'pruned old backup');
      } catch (err) {
        log.warn({ err, path: b.path }, 'prune failed');
      }
    }
  }
}

interface BackupEntry {
  readonly path: string;
  readonly ts: number;
}

function groupBackupsByWorkspace(
  entries: readonly string[],
  outputDir: string,
): Map<string, BackupEntry[]> {
  const groups = new Map<string, BackupEntry[]>();
  for (const entry of entries) {
    const match = /^([0-9a-f-]{36})-(\d+)\.zip$/.exec(entry);
    if (!match) continue;
    const workspaceId = match[1];
    const ts = Number(match[2]);
    if (!workspaceId || !Number.isFinite(ts)) continue;
    const list = groups.get(workspaceId) ?? [];
    list.push({ path: join(outputDir, entry), ts });
    groups.set(workspaceId, list);
  }
  return groups;
}

function pickByBucket(
  list: readonly { path: string; ts: number }[],
  bucketMs: number,
  limit: number,
): readonly { path: string; ts: number }[] {
  if (limit <= 0) return [];
  const seen = new Set<number>();
  const out: { path: string; ts: number }[] = [];
  for (const item of list) {
    const bucket = Math.floor(item.ts / bucketMs);
    if (seen.has(bucket)) continue;
    seen.add(bucket);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}
